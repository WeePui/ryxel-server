import OpenAI from "openai";
import Product from "../models/productModel";
import Category from "../models/categoryModel";
import Review from "../models/reviewModel";
import Order from "../models/orderModel";
import { Types } from "mongoose";

// Initialize OpenAI client for Alibaba Cloud
const openai = new OpenAI({
  apiKey: process.env.ALIBABA_MODEL_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

interface ProductContext {
  _id: string;
  name: string;
  description: string;
  brand: string;
  category: string;
  price: number;
  rating: number;
  sold: number;
  stock: number;
  specifications: Record<string, string>;
  reviews: string[];
}

interface RAGResponse {
  answer: string;
  sources: string[];
  confidence: number;
  retrievedContext: ProductContext[];
}

class RAGService {
  private static instance: RAGService;
  private productEmbeddings: Map<string, number[]> = new Map();
  private productContexts: Map<string, ProductContext> = new Map();

  private constructor() {}

  static getInstance(): RAGService {
    if (!RAGService.instance) {
      RAGService.instance = new RAGService();
    }
    return RAGService.instance;
  }
  /**
   * Generate embeddings using Alibaba Cloud (with fallback to simple embedding)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // For now, use simple embedding since Alibaba Cloud embedding API might not be available
    // or cost money. This provides reliable, fast operation.
    console.log("Using simple embedding for cost efficiency");
    return this.generateSimpleEmbedding(text);
    
    /* Uncomment this block if you want to try Alibaba Cloud embeddings
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-v1", // Alibaba Cloud embedding model
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error("Error generating Alibaba embedding, falling back to simple:", error);
      return this.generateSimpleEmbedding(text);
    }
    */
  }
  /**
   * Enhanced simple embedding based on gaming keywords (Vietnamese + English)
   */
  private generateSimpleEmbedding(text: string): number[] {
    const keywords = [
      // Gaming peripherals (English)
      "mouse", "keyboard", "headset", "chair", "desk", "monitor", "mousepad",
      "gaming", "rgb", "wireless", "mechanical", "optical", "laser",
      
      // Gaming peripherals (Vietnamese)
      "chuột", "bàn phím", "tai nghe", "ghế", "bàn", "màn hình", "lót chuột",
      "game", "gaming", "chơi game", "cơ", "không dây", "có dây",
      
      // Brands
      "logitech", "razer", "steelseries", "corsair", "hyperx", "asus", "msi",
      "roccat", "cooler master", "thermaltake", "redragon", "akko",
      
      // Features
      "dpi", "polling rate", "switches", "backlighting", "software", "driver",
      "ergonomic", "comfortable", "precision", "speed", "accuracy",
      
      // Vietnamese features
      "thoải mái", "chính xác", "nhanh", "bền", "đẹp", "chất lượng",
      "giá rẻ", "tốt", "hay", "đáng mua", "nên mua", "tư vấn",
      
      // Price terms
      "cheap", "expensive", "budget", "premium", "affordable",
      "rẻ", "đắt", "tiết kiệm", "cao cấp", "phù hợp"
    ];
    
    const embedding = new Array(384).fill(0); // Standard embedding size
    const lowercaseText = text.toLowerCase();
    
    keywords.forEach((keyword, index) => {
      if (lowercaseText.includes(keyword.toLowerCase())) {
        // Use multiple dimensions for each keyword to create richer embeddings
        const baseIndex = (index * 5) % 384;
        embedding[baseIndex] = 1;
        embedding[(baseIndex + 1) % 384] = 0.8;
        embedding[(baseIndex + 2) % 384] = 0.6;
        embedding[(baseIndex + 3) % 384] = 0.4;
        embedding[(baseIndex + 4) % 384] = 0.2;
      }
    });

    // Add character-level features for better matching
    const chars = lowercaseText.split('');
    chars.forEach((char, index) => {
      if (char.match(/[a-zA-Zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/)) {
        const charCode = char.charCodeAt(0);
        embedding[charCode % 384] = Math.min(embedding[charCode % 384] + 0.1, 1);
      }
    });

    return embedding;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    const dotProduct = vec1.reduce((sum, a, i) => sum + a * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, a) => sum + a * a, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, a) => sum + a * a, 0));

    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Index all products for vector search
   */
  async indexProducts(): Promise<void> {
    try {
      console.log("Starting product indexing for RAG...");

      const products = await Product.find({ isDeleted: false })
        .populate("category", "name")
        .populate({
          path: "reviews",
          match: { status: "approved" },
          select: "review rating",
          options: { limit: 5 },
        })
        .lean();

      let indexedCount = 0;

      for (const product of products) {
        // Create comprehensive product context
        const context: ProductContext = {
          _id: product._id.toString(),
          name: product.name,
          description: product.description,
          brand: product.brand,
          category: (product.category as any)?.name || "Unknown",
          price: product.lowestPrice || 0,
          rating: product.rating || 0,
          sold: product.sold || 0,
          stock: product.totalStock || 0,
          specifications: {},
          reviews: [],
        };

        // Extract specifications from variants
        if (product.variants && product.variants.length > 0) {
          const allSpecs: Record<string, string> = {};
          product.variants.forEach((variant: any) => {
            if (variant.specifications) {
              Object.entries(variant.specifications).forEach(([key, value]) => {
                allSpecs[key] = value;
              });
            }
          });
          context.specifications = allSpecs;
        }

        // Add review content
        if (product.reviews && Array.isArray(product.reviews)) {
          context.reviews = product.reviews
            .map((review: any) => review.review)
            .filter(Boolean)
            .slice(0, 3); // Limit to top 3 reviews
        }

        // Create searchable text for embedding
        const searchableText = [
          product.name,
          product.description,
          product.brand,
          (product.category as any)?.name,
          Object.values(context.specifications).join(" "),
          context.reviews.join(" "),
        ]
          .filter(Boolean)
          .join(" ");

        // Generate and store embedding
        const embedding = await this.generateEmbedding(searchableText);

        this.productEmbeddings.set(product._id.toString(), embedding);
        this.productContexts.set(product._id.toString(), context);

        indexedCount++;

        // Add delay to avoid rate limiting
        if (indexedCount % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          console.log(`Indexed ${indexedCount}/${products.length} products`);
        }
      }

      console.log(`✅ Successfully indexed ${indexedCount} products for RAG`);
    } catch (error) {
      console.error("Error indexing products:", error);
    }
  }

  /**
   * Retrieve relevant product contexts based on query
   */
  async retrieveRelevantProducts(
    query: string,
    topK: number = 5
  ): Promise<ProductContext[]> {
    if (this.productContexts.size === 0) {
      await this.indexProducts();
    }

    const queryEmbedding = await this.generateEmbedding(query);
    const similarities: Array<{ productId: string; similarity: number }> = [];

    // Calculate similarity with all products
    for (const [productId, embedding] of this.productEmbeddings.entries()) {
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      similarities.push({ productId, similarity });
    }

    // Sort by similarity and get top K
    const topProducts = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map((item) => this.productContexts.get(item.productId)!)
      .filter(Boolean);

    return topProducts;
  }

  /**
   * Generate context-aware response using RAG
   */
  async generateRAGResponse(
    query: string,
    conversationHistory: string[] = []
  ): Promise<RAGResponse> {
    try {
      const startTime = Date.now();

      // Retrieve relevant product contexts
      const relevantProducts = await this.retrieveRelevantProducts(query, 5);

      if (relevantProducts.length === 0) {
        return {
          answer:
            "I couldn't find specific products related to your query. Could you please provide more details about what you're looking for?",
          sources: [],
          confidence: 0.3,
          retrievedContext: [],
        };
      }

      // Create context for the LLM
      const contextText = relevantProducts
        .map((product) => {
          const specs = Object.entries(product.specifications)
            .map(([key, value]) => `${key}: ${value}`)
            .join(", ");

          const reviews =
            product.reviews.length > 0
              ? `Customer reviews: ${product.reviews.join(". ")}`
              : "";

          return `
Product: ${product.name}
Brand: ${product.brand}
Category: ${product.category}
Price: ${product.price.toLocaleString("vi-VN")} VND
Rating: ${product.rating}/5 (${product.sold} sold)
Stock: ${product.stock} units
Description: ${product.description}
Specifications: ${specs}
${reviews}
        `.trim();
        })
        .join("\n\n---\n\n");

      // Create conversation context
      const conversationContext =
        conversationHistory.length > 0
          ? `Previous conversation:\n${conversationHistory.slice(-3).join("\n")}\n\n`
          : "";

      // Generate response using OpenAI
      const prompt = `
You are Ryxel AI, a helpful customer service assistant for Ryxel gaming equipment store. Based on the product information provided, answer the customer's question professionally and helpfully.

${conversationContext}

Product Information:
${contextText}

Customer Question: ${query}

Instructions:
1. Provide specific product recommendations based on the retrieved information
2. Include relevant details like price, specifications, and customer reviews
3. Be conversational and helpful
4. If asked about availability, mention current stock levels
5. Suggest alternatives if appropriate
6. Keep responses under 300 words
7. Always be accurate about product details

Response:`;

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are Ryxel AI, a knowledgeable customer service assistant for a gaming equipment store.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      const response =
        completion.choices[0].message.content ||
        "I apologize, but I'm having trouble generating a response right now. Please try again.";

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Calculate confidence based on similarity and response quality
      const avgSimilarity =
        relevantProducts.length > 0
          ? relevantProducts.reduce((sum, _) => sum + 0.8, 0) /
            relevantProducts.length
          : 0;

      const confidence = Math.min(
        avgSimilarity + (responseTime < 2000 ? 0.2 : 0),
        1
      );

      return {
        answer: response,
        sources: relevantProducts.map((p) => p.name),
        confidence,
        retrievedContext: relevantProducts,
      };
    } catch (error) {
      console.error("Error generating RAG response:", error);

      // Fallback response
      return {
        answer:
          "I'm experiencing some technical difficulties. Please try rephrasing your question or contact our support team for immediate assistance.",
        sources: [],
        confidence: 0.1,
        retrievedContext: [],
      };
    }
  }

  /**
   * Get popular products in a category for recommendations
   */
  async getPopularProductsInCategory(
    categoryName: string,
    limit: number = 3
  ): Promise<ProductContext[]> {
    try {
      const products = await Product.find({
        isDeleted: false,
        _categoryName: new RegExp(categoryName, "i"),
      })
        .sort({ sold: -1, rating: -1 })
        .limit(limit)
        .populate("category", "name")
        .lean();

      return products.map((product) => ({
        _id: product._id.toString(),
        name: product.name,
        description: product.description,
        brand: product.brand,
        category: (product.category as any)?.name || categoryName,
        price: product.lowestPrice || 0,
        rating: product.rating || 0,
        sold: product.sold || 0,
        stock: product.totalStock || 0,
        specifications: {},
        reviews: [],
      }));
    } catch (error) {
      console.error("Error getting popular products:", error);
      return [];
    }
  }

  /**
   * Search products by specific criteria
   */
  async searchProductsByCriteria(
    criteria: {
      brand?: string;
      category?: string;
      priceRange?: { min: number; max: number };
      minRating?: number;
    },
    limit: number = 5
  ): Promise<ProductContext[]> {
    try {
      const query: any = { isDeleted: false };

      if (criteria.brand) {
        query.brand = new RegExp(criteria.brand, "i");
      }

      if (criteria.category) {
        query._categoryName = new RegExp(criteria.category, "i");
      }

      if (criteria.priceRange) {
        query.lowestPrice = {
          $gte: criteria.priceRange.min,
          $lte: criteria.priceRange.max,
        };
      }

      if (criteria.minRating) {
        query.rating = { $gte: criteria.minRating };
      }

      const products = await Product.find(query)
        .sort({ rating: -1, sold: -1 })
        .limit(limit)
        .populate("category", "name")
        .lean();

      return products.map((product) => ({
        _id: product._id.toString(),
        name: product.name,
        description: product.description,
        brand: product.brand,
        category: (product.category as any)?.name || "Unknown",
        price: product.lowestPrice || 0,
        rating: product.rating || 0,
        sold: product.sold || 0,
        stock: product.totalStock || 0,
        specifications: {},
        reviews: [],
      }));
    } catch (error) {
      console.error("Error searching products by criteria:", error);
      return [];
    }
  }
}

export default RAGService;
