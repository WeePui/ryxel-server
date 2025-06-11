import { faqMap } from "../helpers/faqData";
import catchAsync from "../utils/catchAsync";
import { WorkloadAnalyzer } from "../utils/workloadAnalyzer";
import RAGService from "../utils/ragService";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.ALIBABA_MODEL_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

const systemPrompt = `
Bạn là nhân viên tư vấn của Ryxel Store — một cửa hàng chuyên bán gaming gear (chuột, bàn phím, tai nghe, ghế gaming, v.v...).
Hãy trả lời khách hàng như một nhân viên chăm sóc khách hàng tận tâm, thân thiện, ngắn gọn và rõ ràng.

QUAN TRỌNG - Định dạng trả lời:
- Luôn trả lời bằng tiếng Việt
- Sử dụng markdown để định dạng câu trả lời đẹp và dễ đọc
- Khi đề cập đến sản phẩm, tạo link đến trang sản phẩm theo định dạng: [Tên sản phẩm](${process.env.CLIENT_HOST}/products/product-slug)
- Sử dụng **in đậm** cho thông tin quan trọng như giá cả, tính năng nổi bật
- Sử dụng emoji phù hợp để làm cho câu trả lời sinh động hơn

HƯỚNG DẪN TƯƠNG TÁC:
- Chỉ trả lời dựa trên thông tin của Ryxel Store
- Nếu không chắc chắn hoặc không biết câu trả lời, hãy nói "Hiện tại em chưa có thông tin chính xác về vấn đề này, anh/chị có thể liên hệ hotline hoặc inbox fanpage để được hỗ trợ thêm nhé."
- Không bịa thêm thông tin về sản phẩm, phương thức thanh toán, phí vận chuyển, hay chính sách nếu chưa có sẵn trong câu hỏi hoặc trong dữ liệu cửa hàng
- Luôn xưng hô anh/chị cho lịch sự, không dùng từ ngữ suồng sã
- Khi tư vấn sản phẩm, hãy đưa ra so sánh cụ thể và gợi ý phù hợp với nhu cầu khách hàng

VÍ DỤ ĐỊNH DẠNG TRẢ LỜI:
"🎮 **Sản phẩm nổi bật cho game thủ:**

1. **[Logitech G502 Hero](${process.env.CLIENT_HOST}/products/logitech-g502-hero)** - ⭐ 4.8/5
   - Giá: **890.000 VND**
   - DPI: Lên đến 25,600
   - Phù hợp: Game FPS, MOBA

2. **[Razer DeathAdder V3](${process.env.CLIENT_HOST}/products/razer-deathadder-v3)** - ⭐ 4.7/5
   - Giá: **1.200.000 VND**  
   - Sensor cao cấp Focus Pro 30K
   - Phù hợp: Game MMO, RPG

💡 **Gợi ý của em:** Tùy vào ngân sách và loại game anh/chị thường chơi mà em sẽ tư vấn cụ thể hơn!"

CHÍNH XÁC VỀ ĐƯỜNG DẪN SẢN PHẨM:
- PHẢI sử dụng slug thực của sản phẩm từ database, KHÔNG tự tạo slug
- Định dạng: [Tên sản phẩm](${process.env.CLIENT_HOST}/products/{slug_thực_từ_database})`;

// Helper function to create product links
function createProductLink(productName: string, productSlug: string): string {
  return `[${productName}](${process.env.CLIENT_HOST}/products/${productSlug})`;
}

// Helper function to format price in VND
function formatPrice(price: number): string {
  return `**${price.toLocaleString("vi-VN")} VND**`;
}

// Intent classification và workload tracking
interface WorkloadMetrics {
  intent: string;
  automationRate: number;
  responseTime: number;
  workloadReduced: boolean;
}

function classifyUserIntent(userMessage: string): {
  intent: string;
  automationRate: number;
} {
  const lowerMsg = userMessage.toLowerCase();

  // FAQ queries (50% of total workload, 95% automation)
  const faqKeywords = [
    "bảo hành",
    "đổi trả",
    "thanh toán",
    "vận chuyển",
    "giao hàng",
    "chính sách",
    "phí",
  ];
  if (faqKeywords.some((keyword) => lowerMsg.includes(keyword))) {
    return { intent: "faq", automationRate: 95 };
  }

  // Order status (15% of total workload, 80% automation)
  const orderKeywords = [
    "đơn hàng",
    "kiểm tra",
    "trạng thái",
    "giao chưa",
    "tracking",
    "mã đơn",
  ];
  if (orderKeywords.some((keyword) => lowerMsg.includes(keyword))) {
    return { intent: "order_status", automationRate: 80 };
  }

  // Product consultation (20% of total workload, 70% automation)
  const productKeywords = [
    "tư vấn",
    "nên mua",
    "so sánh",
    "gaming",
    "chuột",
    "bàn phím",
    "tai nghe",
    "recommend",
  ];
  if (productKeywords.some((keyword) => lowerMsg.includes(keyword))) {
    return { intent: "product_consultation", automationRate: 70 };
  }

  // Technical support (10% of total workload, 60% automation)
  const techKeywords = [
    "cài đặt",
    "setup",
    "lỗi",
    "không hoạt động",
    "driver",
    "tương thích",
  ];
  if (techKeywords.some((keyword) => lowerMsg.includes(keyword))) {
    return { intent: "technical_support", automationRate: 60 };
  }

  // General inquiries (5% of total workload, 30% automation)
  return { intent: "general", automationRate: 30 };
}

function getRelevantFAQ(userMessage: string): string | null {
  const lowerMsg = userMessage.toLowerCase();
  for (const faq of faqMap) {
    for (const key of faq.keys) {
      if (lowerMsg.includes(key)) {
        return faq.answer;
      }
    }
  }
  return null;
}

// Log workload metrics
function logWorkloadMetrics(metrics: WorkloadMetrics): void {
  const timestamp = new Date().toISOString();
  console.log(`📊 [${timestamp}] Chatbot Metrics:`, {
    intent: metrics.intent,
    automationRate: `${metrics.automationRate}%`,
    responseTime: `${metrics.responseTime}ms`,
    workloadReduced: metrics.workloadReduced ? "✅ Yes" : "❌ No",
  });
}

// Save metrics to database for analysis
async function saveWorkloadMetrics(
  metrics: WorkloadMetrics,
  userMessage: string,
  responseType: "faq" | "ai"
): Promise<void> {
  try {
    await WorkloadAnalyzer.saveMetrics({
      intent: metrics.intent,
      automationRate: metrics.automationRate,
      responseTime: metrics.responseTime,
      responseType,
      workloadReduced: metrics.workloadReduced,
      userMessage,
    });
  } catch (error) {
    console.error("Error saving workload metrics:", error);
  }
}

export const getChatbotResponse = catchAsync(async (req, res) => {
  const overallStart = Date.now();
  const userMessage = req.body.message;
  const conversationHistory = req.body.conversationHistory || [];

  // Classify user intent and get automation rate
  const { intent, automationRate } = classifyUserIntent(userMessage);

  // Try FAQ first for simple queries (performance optimization)
  const faqStart = Date.now();
  const matchedFAQ = getRelevantFAQ(userMessage);
  const faqTime = Date.now() - faqStart;

  if (matchedFAQ && intent === "faq") {
    // FAQ response - fast track for policy/general questions
    const totalTime = Date.now() - overallStart;

    const metrics: WorkloadMetrics = {
      intent,
      automationRate,
      responseTime: totalTime,
      workloadReduced: automationRate > 50,
    };

    logWorkloadMetrics(metrics);
    await saveWorkloadMetrics(metrics, userMessage, "faq");
    return res.status(200).json({
      status: "success",
      data: {
        response: matchedFAQ,
        type: "faq",
        intent,
        automationRate,
        responseTime: totalTime,
        workloadReduced: true,
        productLinks: [],
        sources: ["Ryxel Store Policy"],
      },
    });
  }

  // Use RAG for product-related queries and complex questions
  const ragStart = Date.now();
  const ragService = RAGService.getInstance();

  try {
    const ragResponse = await ragService.generateRAGResponse(
      userMessage,
      conversationHistory
    );
    const ragTime = Date.now() - ragStart;
    const totalTime = Date.now() - overallStart;

    const metrics: WorkloadMetrics = {
      intent,
      automationRate,
      responseTime: totalTime,
      workloadReduced: ragResponse.confidence > 0.6,
    };

    logWorkloadMetrics(metrics);
    await saveWorkloadMetrics(metrics, userMessage, "ai");
    res.status(200).json({
      status: "success",
      data: {
        response: ragResponse.answer,
        type: "rag",
        intent,
        automationRate,
        responseTime: totalTime,
        ragProcessingTime: ragTime,
        workloadReduced: ragResponse.confidence > 0.6,
        sources: ragResponse.sources,
        confidence: ragResponse.confidence,
        productLinks: ragResponse.productLinks || [],
        retrievedProducts: ragResponse.retrievedContext.map((p) => ({
          id: p._id,
          name: p.name,
          price: p.price,
          rating: p.rating,
        })),
      },
    });
  } catch (error) {
    console.error("RAG Error, falling back to basic AI:", error);

    // Fallback to basic AI if RAG fails
    const baseMessages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    if (matchedFAQ) {
      baseMessages.push({
        role: "assistant",
        content: `📋 **Thông tin chính thức từ Ryxel Store:**\n\n${matchedFAQ}`,
      });
    }

    const aiStart = Date.now();
    const completion = await openai.chat.completions.create({
      model: "qwen-turbo",
      messages: baseMessages,
    });
    const aiTime = Date.now() - aiStart;
    const totalTime = Date.now() - overallStart;

    const response = completion.choices[0].message.content;
    const metrics: WorkloadMetrics = {
      intent,
      automationRate,
      responseTime: totalTime,
      workloadReduced: automationRate > 50,
    };

    logWorkloadMetrics(metrics);
    await saveWorkloadMetrics(metrics, userMessage, "ai");
    res.status(200).json({
      status: "success",
      data: {
        response,
        type: "ai_fallback",
        intent,
        automationRate,
        responseTime: totalTime,
        aiProcessingTime: aiTime,
        workloadReduced: automationRate > 50,
        productLinks: [],
        sources: ["AI Assistant"],
      },
    });
  }
});

// Analytics endpoints
export const getChatbotAnalytics = catchAsync(async (req, res) => {
  const { timeframe = "day" } = req.query;

  const workloadStats = await WorkloadAnalyzer.getWorkloadStats(
    timeframe as "day" | "week" | "month"
  );
  const performanceStats = await WorkloadAnalyzer.getPerformanceBenchmarks(
    timeframe as "day" | "week" | "month"
  );

  res.status(200).json({
    status: "success",
    data: {
      workloadStats,
      performanceStats,
      summary: {
        workloadReductionAchieved: workloadStats.avgAutomationRate >= 70,
        performanceTargetsMet: {
          faqUnder1s: performanceStats.faq.under1sPercentage >= 95,
          aiUnder2s: performanceStats.ai.under2sPercentage >= 90,
        },
      },
    },
  });
});

export const getBenchmarkReport = catchAsync(async (req, res) => {
  const { timeframe = "day" } = req.query;

  const stats = await WorkloadAnalyzer.getWorkloadStats(
    timeframe as "day" | "week" | "month"
  );
  const performance = await WorkloadAnalyzer.getPerformanceBenchmarks(
    timeframe as "day" | "week" | "month"
  );

  // Generate detailed report
  const report = {
    period: timeframe,
    generatedAt: new Date().toISOString(),

    // Key metrics
    keyMetrics: {
      totalQueries: stats.totalQueries,
      workloadReductionRate: stats.workloadReductionRate,
      avgAutomationRate: stats.avgAutomationRate,
      avgResponseTime: stats.avgResponseTime,
    },

    // Performance benchmarks
    performance: {
      faq: {
        avgResponseTime: performance.faq.avgResponseTime,
        under1sSuccess: performance.faq.under1sPercentage,
        target: "< 1000ms",
        status:
          performance.faq.under1sPercentage >= 95
            ? "✅ ACHIEVED"
            : "❌ NEEDS IMPROVEMENT",
      },
      ai: {
        avgResponseTime: performance.ai.avgResponseTime,
        under2sSuccess: performance.ai.under2sPercentage,
        target: "< 2000ms",
        status:
          performance.ai.under2sPercentage >= 90
            ? "✅ ACHIEVED"
            : "❌ NEEDS IMPROVEMENT",
      },
    },

    // Workload analysis
    workloadAnalysis: {
      target: "70% reduction",
      achieved: stats.avgAutomationRate,
      status:
        stats.avgAutomationRate >= 70 ? "✅ TARGET MET" : "❌ TARGET NOT MET",
      breakdown: stats.intentStats,
    },

    // Recommendations
    recommendations: generateRecommendations(stats, performance),
  };

  res.status(200).json({
    status: "success",
    data: report,
  });
});

function generateRecommendations(
  workloadStats: any,
  performanceStats: any
): string[] {
  const recommendations: string[] = [];

  if (workloadStats.avgAutomationRate < 70) {
    recommendations.push("Improve FAQ coverage to increase automation rate");
    recommendations.push("Train AI model with more domain-specific data");
  }

  if (performanceStats.faq.under1sPercentage < 95) {
    recommendations.push("Optimize FAQ matching algorithm for faster response");
    recommendations.push("Consider caching frequently asked questions");
  }

  if (performanceStats.ai.under2sPercentage < 90) {
    recommendations.push("Optimize AI model inference time");
    recommendations.push(
      "Consider using faster model variants for simple queries"
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "All targets met! Consider expanding chatbot capabilities"
    );
  }

  return recommendations;
}

// RAG management endpoints
export const initializeRAG = catchAsync(async (req, res) => {
  const ragService = RAGService.getInstance();

  console.log("🚀 Initializing RAG system...");
  const start = Date.now();

  await ragService.indexProducts();

  const duration = Date.now() - start;

  res.status(200).json({
    status: "success",
    message: "RAG system initialized successfully",
    data: {
      indexingTime: duration,
      timestamp: new Date().toISOString(),
    },
  });
});

export const searchProducts = catchAsync(async (req, res) => {
  const { query, limit = 5 } = req.query;

  if (!query) {
    return res.status(400).json({
      status: "error",
      message: "Query parameter is required",
    });
  }

  const ragService = RAGService.getInstance();
  const products = await ragService.retrieveRelevantProducts(
    query as string,
    Number(limit)
  );

  res.status(200).json({
    status: "success",
    data: {
      query,
      products,
      count: products.length,
    },
  });
});

export const getProductRecommendations = catchAsync(async (req, res) => {
  const {
    category,
    brand,
    priceMin,
    priceMax,
    minRating,
    limit = 5,
  } = req.query;

  const ragService = RAGService.getInstance();

  if (category) {
    // Get popular products in category
    const products = await ragService.getPopularProductsInCategory(
      category as string,
      Number(limit)
    );
    return res.status(200).json({
      status: "success",
      data: {
        products,
        criteria: { category },
        count: products.length,
      },
    });
  }

  // Search by criteria
  const criteria: any = {};
  if (brand) criteria.brand = brand;
  if (priceMin || priceMax) {
    criteria.priceRange = {
      min: priceMin ? Number(priceMin) : 0,
      max: priceMax ? Number(priceMax) : 999999999,
    };
  }
  if (minRating) criteria.minRating = Number(minRating);

  const products = await ragService.searchProductsByCriteria(
    criteria,
    Number(limit)
  );

  res.status(200).json({
    status: "success",
    data: {
      products,
      criteria,
      count: products.length,
    },
  });
});
