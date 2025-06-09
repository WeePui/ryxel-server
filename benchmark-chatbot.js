const axios = require("axios");

// Test cases cho different workload categories
const testCases = [
  // FAQ cases (should be <1s, 95% automation)
  {
    message: "chính sách bảo hành",
    category: "faq",
    expectedIntent: "faq",
  },
  {
    message: "phương thức thanh toán",
    category: "faq",
    expectedIntent: "faq",
  },
  {
    message: "phí vận chuyển",
    category: "faq",
    expectedIntent: "faq",
  },
  {
    message: "thời gian giao hàng",
    category: "faq",
    expectedIntent: "faq",
  },

  // Order status cases (should be fast, 80% automation)
  {
    message: "kiểm tra đơn hàng",
    category: "order_status",
    expectedIntent: "order_status",
  },
  {
    message: "trạng thái giao hàng",
    category: "order_status",
    expectedIntent: "order_status",
  },

  // Product consultation cases (70% automation)
  {
    message: "tư vấn chuột gaming cho FPS",
    category: "product_consultation",
    expectedIntent: "product_consultation",
  },
  {
    message: "so sánh bàn phím cơ và màng",
    category: "product_consultation",
    expectedIntent: "product_consultation",
  },
  {
    message: "tai nghe nào tốt cho game",
    category: "product_consultation",
    expectedIntent: "product_consultation",
  },

  // Technical support cases (60% automation)
  {
    message: "cài đặt driver chuột",
    category: "technical_support",
    expectedIntent: "technical_support",
  },
  {
    message: "lỗi bàn phím không hoạt động",
    category: "technical_support",
    expectedIntent: "technical_support",
  },

  // General cases (30% automation)
  {
    message: "hello xin chào",
    category: "general",
    expectedIntent: "general",
  },
];

const API_BASE_URL = "http://localhost:8000/api/v1";

async function runBenchmark() {
  console.log("🚀 Starting Ryxel Chatbot Benchmark...\n");

  const results = {
    faq: [],
    order_status: [],
    product_consultation: [],
    technical_support: [],
    general: [],
  };

  let totalAutomationScore = 0;
  let totalWorkloadReduction = 0;

  for (const testCase of testCases) {
    try {
      console.log(`Testing: "${testCase.message}"`);

      const start = Date.now();
      const response = await axios.post(`${API_BASE_URL}/chatbot`, {
        message: testCase.message,
      });
      const time = Date.now() - start;

      const data = response.data.data;
      const type = data.type || "ai";
      const intent = data.intent || "unknown";
      const automationRate = data.automationRate || 0;
      const responseTime = data.responseTime || time;

      results[testCase.category].push({
        message: testCase.message,
        time,
        responseTime,
        type,
        intent,
        automationRate,
        workloadReduced: data.workloadReduced,
      });

      totalAutomationScore += automationRate;
      if (data.workloadReduced) totalWorkloadReduction++;

      console.log(
        `  ✅ ${type.toUpperCase()}: ${responseTime}ms (${automationRate}% automation)`
      );
    } catch (error) {
      console.error(`  ❌ Error: ${testCase.message}`, error.message);
    }

    // Small delay between requests
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log("\n📊 BENCHMARK RESULTS:");
  console.log("=====================================");

  // Calculate performance metrics
  const allFAQ = results.faq;
  const allAI = [
    ...results.order_status,
    ...results.product_consultation,
    ...results.technical_support,
    ...results.general,
  ];

  if (allFAQ.length > 0) {
    const faqAvg =
      allFAQ.reduce((sum, r) => sum + r.responseTime, 0) / allFAQ.length;
    const faqUnder1s = allFAQ.filter((r) => r.responseTime < 1000).length;
    console.log(`📈 FAQ Performance:`);
    console.log(`   Average: ${faqAvg.toFixed(0)}ms`);
    console.log(
      `   Under 1s: ${faqUnder1s}/${allFAQ.length} (${((faqUnder1s / allFAQ.length) * 100).toFixed(1)}%)`
    );
  }

  if (allAI.length > 0) {
    const aiAvg =
      allAI.reduce((sum, r) => sum + r.responseTime, 0) / allAI.length;
    const aiUnder2s = allAI.filter((r) => r.responseTime < 2000).length;
    console.log(`🤖 AI Performance:`);
    console.log(`   Average: ${aiAvg.toFixed(0)}ms`);
    console.log(
      `   Under 2s: ${aiUnder2s}/${allAI.length} (${((aiUnder2s / allAI.length) * 100).toFixed(1)}%)`
    );
  }

  // Workload reduction analysis
  const avgAutomation = totalAutomationScore / testCases.length;
  const workloadReductionRate =
    (totalWorkloadReduction / testCases.length) * 100;

  console.log(`\n🎯 WORKLOAD REDUCTION ANALYSIS:`);
  console.log(`=====================================`);
  console.log(`Average Automation Rate: ${avgAutomation.toFixed(1)}%`);
  console.log(
    `Queries with Workload Reduction: ${totalWorkloadReduction}/${testCases.length} (${workloadReductionRate.toFixed(1)}%)`
  );

  // Intent distribution
  console.log(`\n📋 INTENT DISTRIBUTION:`);
  console.log(`=====================================`);
  Object.keys(results).forEach((category) => {
    const count = results[category].length;
    const percentage = ((count / testCases.length) * 100).toFixed(1);
    const avgAutomation =
      count > 0
        ? (
            results[category].reduce((sum, r) => sum + r.automationRate, 0) /
            count
          ).toFixed(1)
        : 0;
    console.log(
      `${category}: ${count} queries (${percentage}%) - ${avgAutomation}% automation`
    );
  });

  // Overall assessment
  console.log(`\n🏆 OVERALL ASSESSMENT:`);
  console.log(`=====================================`);
  if (avgAutomation >= 70) {
    console.log(
      `✅ 70% Workload Reduction Target: ACHIEVED (${avgAutomation.toFixed(1)}%)`
    );
  } else {
    console.log(
      `❌ 70% Workload Reduction Target: NOT MET (${avgAutomation.toFixed(1)}%)`
    );
  }

  console.log(
    `✅ FAQ Response Time <1s: ${allFAQ.every((r) => r.responseTime < 1000) ? "ACHIEVED" : "NEEDS IMPROVEMENT"}`
  );
  console.log(
    `✅ AI Response Time <2s: ${allAI.every((r) => r.responseTime < 2000) ? "ACHIEVED" : "NEEDS IMPROVEMENT"}`
  );
}

// Run the benchmark
runBenchmark().catch(console.error);
