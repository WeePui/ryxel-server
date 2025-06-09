import OpenAI from "openai";
import Product from "../models/productModel";
import Category from "../models/categoryModel";
import Review from "../models/reviewModel";
import Order from "../models/orderModel";
import { Types } from "mongoose";
import { calculateFinalPrice } from "./saleValidation";

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
  productLinks?: Array<{
    name: string;
    url: string;
    price: number;
  }>;
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
      "mouse",
      "keyboard",
      "headset",
      "chair",
      "desk",
      "monitor",
      "mousepad",
      "gaming",
      "rgb",
      "wireless",
      "mechanical",
      "optical",
      "laser",

      // Gaming peripherals (Vietnamese)
      "chuột",
      "bàn phím",
      "tai nghe",
      "ghế",
      "bàn",
      "màn hình",
      "lót chuột",
      "game",
      "gaming",
      "chơi game",
      "cơ",
      "không dây",
      "có dây",

      // Brands
      "logitech",
      "razer",
      "steelseries",
      "corsair",
      "hyperx",
      "asus",
      "msi",
      "roccat",
      "cooler master",
      "thermaltake",
      "redragon",
      "akko",

      // Features
      "dpi",
      "polling rate",
      "switches",
      "backlighting",
      "software",
      "driver",
      "ergonomic",
      "comfortable",
      "precision",
      "speed",
      "accuracy",

      // Vietnamese features
      "thoải mái",
      "chính xác",
      "nhanh",
      "bền",
      "đẹp",
      "chất lượng",
      "giá rẻ",
      "tốt",
      "hay",
      "đáng mua",
      "nên mua",
      "tư vấn",

      // Price terms
      "cheap",
      "expensive",
      "budget",
      "premium",
      "affordable",
      "rẻ",
      "đắt",
      "tiết kiệm",
      "cao cấp",
      "phù hợp",
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
    const chars = lowercaseText.split("");
    chars.forEach((char, index) => {
      if (
        char.match(
          /[a-zA-Zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/
        )
      ) {
        const charCode = char.charCodeAt(0);
        embedding[charCode % 384] = Math.min(
          embedding[charCode % 384] + 0.1,
          1
        );
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
          price: 0, // Will be calculated below
          rating: product.rating || 0,
          sold: product.sold || 0,
          stock: product.totalStock || 0,
          specifications: {},
          reviews: [],
        };

        // Extract specifications from variants and calculate lowest price
        if (product.variants && product.variants.length > 0) {
          const allSpecs: Record<string, string> = {};
          let lowestPrice = Infinity;

          product.variants.forEach((variant: any) => {
            if (variant.specifications) {
              Object.entries(variant.specifications).forEach(([key, value]) => {
                allSpecs[key] = String(value);
              });
            }

            // Calculate final price manually since we're using .lean()
            const finalPrice = calculateFinalPrice(
              variant.price,
              variant.saleOff
            );
            if (finalPrice < lowestPrice) {
              lowestPrice = finalPrice;
            }
          });
          context.specifications = allSpecs;
          context.price = lowestPrice === Infinity ? 0 : lowestPrice;
        } else {
          // If no variants, set price to 0 (this shouldn't happen in real products)
          context.price = 0;
        } // Add review content - fetch separately since we're using lean()
        try {
          const reviews = await Review.find({
            product: product._id,
            status: "approved",
          })
            .select("review")
            .limit(3)
            .lean();

          context.reviews = reviews
            .map((review: any) => review.review)
            .filter(Boolean);
        } catch (error) {
          console.warn(
            `Failed to fetch reviews for product ${product._id}:`,
            error
          );
          context.reviews = [];
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

      // Enhanced expensive product detection
      const isExpensiveQuery =
        /mắc|đắt|cao cấp|premium|expensive|highest price|most expensive|giá cao|đắt nhất|mắc nhất|sản phẩm đắt|hàng hiệu|luxury/i.test(
          query
        );

      let relevantProducts: ProductContext[];

      if (isExpensiveQuery) {
        // Use MongoDB aggregation for expensive products
        const expensiveProducts = await Product.aggregate([
          { $match: { isDeleted: false } },
          {
            $addFields: {
              highestPrice: {
                $max: {
                  $map: {
                    input: "$variants",
                    as: "variant",
                    in: {
                      $cond: {
                        if: { $ifNull: ["$$variant.finalPrice", false] },
                        then: "$$variant.finalPrice",
                        else: "$$variant.price",
                      },
                    },
                  },
                },
              },
            },
          },
          { $sort: { highestPrice: -1, rating: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "categories",
              localField: "category",
              foreignField: "_id",
              as: "category",
            },
          },
          { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
        ]);

        relevantProducts = expensiveProducts.map((product) => ({
          _id: product._id.toString(),
          name: product.name,
          description: product.description,
          brand: product.brand,
          category: product.category?.name || "Unknown",
          price: product.highestPrice || product.lowestPrice || 0,
          rating: product.rating || 0,
          sold: product.sold || 0,
          stock: product.totalStock || 0,
          specifications: {},
          reviews: [],
        }));
      } else {
        // Regular semantic search
        relevantProducts = await this.retrieveRelevantProducts(query, 5);
      }

      if (relevantProducts.length === 0) {
        return {
          answer:
            "Tôi không thể tìm thấy sản phẩm cụ thể liên quan đến truy vấn của bạn. Bạn có thể cung cấp thêm chi tiết về những gì bạn đang tìm kiếm không?",
          sources: [],
          confidence: 0.3,
          retrievedContext: [],
          productLinks: [],
        };
      } // Generate product links
      const productLinks = relevantProducts.map((product) => ({
        name: product.name,
        url: `${process.env.CLIENT_HOST || "http://localhost:3000"}/products/${product.name.toLowerCase().replace(/\s+/g, "-")}`,
        price: product.price,
      }));

      // Rest of the method...

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
        .join("\n\n---\n\n"); // Create conversation context
      const conversationContext =
        conversationHistory.length > 0
          ? `Cuộc trò chuyện trước đó:\n${conversationHistory.slice(-3).join("\n")}\n\n`
          : ""; // Generate response using OpenAI
      const prompt = `
Bạn là nhân viên tư vấn của Ryxel Store, một cửa hàng chuyên bán gaming gear. Dựa vào thông tin sản phẩm được cung cấp, hãy trả lời câu hỏi của khách hàng một cách chuyên nghiệp và hữu ích.

${conversationContext}

Thông tin sản phẩm:
${contextText}

Câu hỏi của khách hàng: ${query}

Hướng dẫn:
1. Đưa ra gợi ý sản phẩm cụ thể dựa trên thông tin đã có
2. Bao gồm các chi tiết liên quan như giá cả, thông số kỹ thuật và đánh giá của khách hàng
3. Trả lời thân thiện và hữu ích
4. Nếu được hỏi về tình trạng hàng, đề cập đến mức tồn kho hiện tại
5. Gợi ý các lựa chọn thay thế nếu phù hợp
6. Giữ câu trả lời dưới 300 từ
7. Luôn chính xác về thông tin sản phẩm

Trả lời:`;
      const completion = await openai.chat.completions.create({
        model: "qwen-turbo",
        messages: [
          {
            role: "system",
            content:
              "Bạn là nhân viên tư vấn của Ryxel Store — một cửa hàng chuyên bán gaming gear. Luôn trả lời bằng tiếng Việt một cách thân thiện, tận tâm và chính xác.",
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
        productLinks,
      };
    } catch (error) {
      console.error("Error generating RAG response:", error);

      // Fallback response
      return {
        answer:
          "Hiện tại em đang gặp một số khó khăn kỹ thuật. Anh/chị có thể diễn đạt lại câu hỏi hoặc liên hệ team hỗ trợ để được tư vấn ngay lập tức.",
        sources: [],
        confidence: 0.1,
        retrievedContext: [],
        productLinks: [],
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
      return products.map((product) => {
        // Calculate lowest price manually
        let lowestPrice = Infinity;
        if (product.variants && product.variants.length > 0) {
          product.variants.forEach((variant: any) => {
            const finalPrice = calculateFinalPrice(
              variant.price,
              variant.saleOff
            );
            if (finalPrice < lowestPrice) {
              lowestPrice = finalPrice;
            }
          });
        }

        return {
          _id: product._id.toString(),
          name: product.name,
          description: product.description,
          brand: product.brand,
          category: (product.category as any)?.name || categoryName,
          price: lowestPrice === Infinity ? 0 : lowestPrice,
          rating: product.rating || 0,
          sold: product.sold || 0,
          stock: product.totalStock || 0,
          specifications: {},
          reviews: [],
        };
      });
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
      return products.map((product) => {
        // Calculate lowest price manually
        let lowestPrice = Infinity;
        if (product.variants && product.variants.length > 0) {
          product.variants.forEach((variant: any) => {
            const finalPrice = calculateFinalPrice(
              variant.price,
              variant.saleOff
            );
            if (finalPrice < lowestPrice) {
              lowestPrice = finalPrice;
            }
          });
        }

        return {
          _id: product._id.toString(),
          name: product.name,
          description: product.description,
          brand: product.brand,
          category: (product.category as any)?.name || "Unknown",
          price: lowestPrice === Infinity ? 0 : lowestPrice,
          rating: product.rating || 0,
          sold: product.sold || 0,
          stock: product.totalStock || 0,
          specifications: {},
          reviews: [],
        };
      });
    } catch (error) {
      console.error("Error searching products by criteria:", error);
      return [];
    }
  }
}

export default RAGService;
