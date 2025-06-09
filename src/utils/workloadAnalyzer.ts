import mongoose from "mongoose";

// Schema để lưu metrics
const chatbotMetricsSchema = new mongoose.Schema({
  intent: {
    type: String,
    required: true,
    enum: [
      "faq",
      "order_status",
      "product_consultation",
      "technical_support",
      "general",
    ],
  },
  automationRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  responseTime: {
    type: Number,
    required: true,
  },
  responseType: {
    type: String,
    enum: ["faq", "ai"],
    required: true,
  },
  workloadReduced: {
    type: Boolean,
    required: true,
  },
  userMessage: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

export const ChatbotMetrics = mongoose.model(
  "ChatbotMetrics",
  chatbotMetricsSchema
);

// Helper functions để analyze workload
export class WorkloadAnalyzer {
  // Save metrics to database
  static async saveMetrics(metrics: {
    intent: string;
    automationRate: number;
    responseTime: number;
    responseType: string;
    workloadReduced: boolean;
    userMessage: string;
  }) {
    try {
      const metricsDoc = new ChatbotMetrics(metrics);
      await metricsDoc.save();
    } catch (error) {
      console.error("Error saving metrics:", error);
    }
  }

  // Get workload reduction statistics
  static async getWorkloadStats(timeframe: "day" | "week" | "month" = "day") {
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case "day":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const metrics = await ChatbotMetrics.find({
      timestamp: { $gte: startDate },
    });

    const totalQueries = metrics.length;
    const automatedQueries = metrics.filter((m) => m.workloadReduced).length;
    const avgAutomationRate =
      metrics.reduce((sum, m) => sum + m.automationRate, 0) / totalQueries;
    const avgResponseTime =
      metrics.reduce((sum, m) => sum + m.responseTime, 0) / totalQueries;

    // Intent breakdown
    const intentStats = metrics.reduce(
      (acc, m) => {
        if (!acc[m.intent]) {
          acc[m.intent] = { count: 0, totalAutomation: 0 };
        }
        acc[m.intent].count++;
        acc[m.intent].totalAutomation += m.automationRate;
        return acc;
      },
      {} as Record<string, { count: number; totalAutomation: number }>
    );

    // Calculate intent percentages
    Object.keys(intentStats).forEach((intent) => {
      intentStats[intent].percentage =
        (intentStats[intent].count / totalQueries) * 100;
      intentStats[intent].avgAutomation =
        intentStats[intent].totalAutomation / intentStats[intent].count;
    });

    return {
      timeframe,
      totalQueries,
      automatedQueries,
      workloadReductionRate: (automatedQueries / totalQueries) * 100,
      avgAutomationRate,
      avgResponseTime,
      intentStats,
    };
  }

  // Get performance benchmarks
  static async getPerformanceBenchmarks(
    timeframe: "day" | "week" | "month" = "day"
  ) {
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case "day":
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    const metrics = await ChatbotMetrics.find({
      timestamp: { $gte: startDate },
    });

    const faqMetrics = metrics.filter((m) => m.responseType === "faq");
    const aiMetrics = metrics.filter((m) => m.responseType === "ai");

    const faqAvgTime =
      faqMetrics.length > 0
        ? faqMetrics.reduce((sum, m) => sum + m.responseTime, 0) /
          faqMetrics.length
        : 0;
    const aiAvgTime =
      aiMetrics.length > 0
        ? aiMetrics.reduce((sum, m) => sum + m.responseTime, 0) /
          aiMetrics.length
        : 0;

    const faqUnder1s = faqMetrics.filter((m) => m.responseTime < 1000).length;
    const aiUnder2s = aiMetrics.filter((m) => m.responseTime < 2000).length;

    return {
      faq: {
        totalQueries: faqMetrics.length,
        avgResponseTime: faqAvgTime,
        under1sCount: faqUnder1s,
        under1sPercentage:
          faqMetrics.length > 0 ? (faqUnder1s / faqMetrics.length) * 100 : 0,
      },
      ai: {
        totalQueries: aiMetrics.length,
        avgResponseTime: aiAvgTime,
        under2sCount: aiUnder2s,
        under2sPercentage:
          aiMetrics.length > 0 ? (aiUnder2s / aiMetrics.length) * 100 : 0,
      },
    };
  }
}
