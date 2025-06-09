const axios = require('axios');

const API_BASE_URL = 'http://localhost:8000/api/v1';

// Extended test cases để simulate real workload
const testCases = [
  // FAQ cases (50% workload, 95% automation)
  { message: "chính sách bảo hành", category: "faq", expectedAutomation: 95 },
  { message: "phương thức thanh toán", category: "faq", expectedAutomation: 95 },
  { message: "phí vận chuyển", category: "faq", expectedAutomation: 95 },
  { message: "thời gian giao hàng", category: "faq", expectedAutomation: 95 },
  { message: "chính sách đổi trả", category: "faq", expectedAutomation: 95 },
  { message: "hóa đơn VAT", category: "faq", expectedAutomation: 95 },
  { message: "địa chỉ cửa hàng", category: "faq", expectedAutomation: 95 },
  { message: "giờ mở cửa", category: "faq", expectedAutomation: 95 },
  { message: "hotline hỗ trợ", category: "faq", expectedAutomation: 95 },
  { message: "cách đặt hàng", category: "faq", expectedAutomation: 95 },
  
  // Order status (15% workload, 80% automation)
  { message: "kiểm tra đơn hàng", category: "order_status", expectedAutomation: 80 },
  { message: "trạng thái giao hàng", category: "order_status", expectedAutomation: 80 },
  { message: "đơn hàng có giao chưa", category: "order_status", expectedAutomation: 80 },
  
  // Product consultation (20% workload, 70% automation)
  { message: "tư vấn chuột gaming cho FPS", category: "product_consultation", expectedAutomation: 70 },
  { message: "so sánh bàn phím cơ và màng", category: "product_consultation", expectedAutomation: 70 },
  { message: "tai nghe nào tốt cho game", category: "product_consultation", expectedAutomation: 70 },
  { message: "recommend gaming setup", category: "product_consultation", expectedAutomation: 70 },
  { message: "nên mua chuột Logitech hay Razer", category: "product_consultation", expectedAutomation: 70 },
  
  // Technical support (10% workload, 60% automation)
  { message: "cài đặt driver chuột", category: "technical_support", expectedAutomation: 60 },
  { message: "lỗi bàn phím không hoạt động", category: "technical_support", expectedAutomation: 60 },
  { message: "setup gaming headset", category: "technical_support", expectedAutomation: 60 },
  
  // General (5% workload, 30% automation)
  { message: "hello xin chào", category: "general", expectedAutomation: 30 },
  { message: "cảm ơn bạn", category: "general", expectedAutomation: 30 }
];

async function runWorkloadSimulation() {
  console.log('🔥 Running Workload Simulation for Ryxel Chatbot...\n');
  console.log('📋 Simulating CSKH workload distribution:');
  console.log('   📞 FAQ: 50% (95% automation)');
  console.log('   📦 Order Status: 15% (80% automation)');
  console.log('   🛒 Product Consultation: 20% (70% automation)');
  console.log('   🔧 Technical Support: 10% (60% automation)');
  console.log('   💬 General: 5% (30% automation)\n');
  
  const results = {
    total: 0,
    automated: 0,
    faq: { count: 0, automated: 0, totalTime: 0 },
    order_status: { count: 0, automated: 0, totalTime: 0 },
    product_consultation: { count: 0, automated: 0, totalTime: 0 },
    technical_support: { count: 0, automated: 0, totalTime: 0 },
    general: { count: 0, automated: 0, totalTime: 0 }
  };

  // Simulate realistic distribution by repeating certain categories
  const simulatedWorkload = [];
  
  // FAQ - 50% of workload (repeat FAQ cases)
  const faqCases = testCases.filter(t => t.category === 'faq');
  for (let i = 0; i < 25; i++) {
    simulatedWorkload.push(faqCases[i % faqCases.length]);
  }
  
  // Order status - 15% of workload
  const orderCases = testCases.filter(t => t.category === 'order_status');
  for (let i = 0; i < 8; i++) {
    simulatedWorkload.push(orderCases[i % orderCases.length]);
  }
  
  // Product consultation - 20% of workload
  const productCases = testCases.filter(t => t.category === 'product_consultation');
  for (let i = 0; i < 10; i++) {
    simulatedWorkload.push(productCases[i % productCases.length]);
  }
  
  // Technical support - 10% of workload
  const techCases = testCases.filter(t => t.category === 'technical_support');
  for (let i = 0; i < 5; i++) {
    simulatedWorkload.push(techCases[i % techCases.length]);
  }
  
  // General - 5% of workload
  const generalCases = testCases.filter(t => t.category === 'general');
  for (let i = 0; i < 2; i++) {
    simulatedWorkload.push(generalCases[i % generalCases.length]);
  }

  console.log(`🚀 Processing ${simulatedWorkload.length} queries...\n`);

  for (const [index, testCase] of simulatedWorkload.entries()) {
    try {
      const start = Date.now();
      const response = await axios.post(`${API_BASE_URL}/chatbot`, {
        message: testCase.message
      });
      const time = Date.now() - start;
      
      const data = response.data.data;
      const category = testCase.category;
      const workloadReduced = data.workloadReduced || false;
      
      results.total++;
      results[category].count++;
      results[category].totalTime += time;
      
      if (workloadReduced) {
        results.automated++;
        results[category].automated++;
      }
      
      console.log(`${index + 1}/50: ${category} - ${time}ms - ${workloadReduced ? '✅' : '❌'}`);
      
    } catch (error) {
      console.error(`❌ Error processing: ${testCase.message}`);
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log('\n📊 WORKLOAD ANALYSIS RESULTS:');
  console.log('='.repeat(60));
  
  // Overall metrics
  const overallAutomation = (results.automated / results.total) * 100;
  console.log(`\n🎯 OVERALL PERFORMANCE:`);
  console.log(`   Total Queries: ${results.total}`);
  console.log(`   Automated: ${results.automated} (${overallAutomation.toFixed(1)}%)`);
  console.log(`   Workload Reduction: ${overallAutomation.toFixed(1)}%`);
  
  // Category breakdown
  console.log(`\n📋 CATEGORY BREAKDOWN:`);
  Object.keys(results).forEach(category => {
    if (category === 'total' || category === 'automated') return;
    
    const data = results[category];
    if (data.count === 0) return;
    
    const automation = (data.automated / data.count) * 100;
    const avgTime = data.totalTime / data.count;
    const percentage = (data.count / results.total) * 100;
    
    console.log(`   ${category.toUpperCase()}:`);
    console.log(`     Volume: ${data.count} queries (${percentage.toFixed(1)}%)`);
    console.log(`     Automation: ${automation.toFixed(1)}%`);
    console.log(`     Avg Response: ${avgTime.toFixed(0)}ms`);
  });
  
  // Performance assessment
  console.log(`\n🏆 PERFORMANCE ASSESSMENT:`);
  if (overallAutomation >= 70) {
    console.log(`   ✅ 70% Workload Reduction: ACHIEVED (${overallAutomation.toFixed(1)}%)`);
  } else {
    console.log(`   ❌ 70% Workload Reduction: NOT MET (${overallAutomation.toFixed(1)}%)`);
  }

  // FAQ and AI response time targets
  const faqAvgTime = results.faq.count > 0 ? results.faq.totalTime / results.faq.count : 0;
  const nonFaqCategories = ['order_status', 'product_consultation', 'technical_support', 'general'];
  let aiTotalTime = 0;
  let aiTotalCount = 0;
  
  nonFaqCategories.forEach(cat => {
    aiTotalTime += results[cat].totalTime;
    aiTotalCount += results[cat].count;
  });
  
  const aiAvgTime = aiTotalCount > 0 ? aiTotalTime / aiTotalCount : 0;
  
  console.log(`   FAQ Response Time: ${faqAvgTime.toFixed(0)}ms (target: <1000ms) ${faqAvgTime < 1000 ? '✅' : '❌'}`);
  console.log(`   AI Response Time: ${aiAvgTime.toFixed(0)}ms (target: <2000ms) ${aiAvgTime < 2000 ? '✅' : '❌'}`);
  
  console.log(`\n💡 BUSINESS IMPACT:`);
  console.log(`   Before: 100% queries handled by CSKH staff`);
  console.log(`   After: ${(100 - overallAutomation).toFixed(1)}% queries need human intervention`);
  console.log(`   Staff time saved: ${overallAutomation.toFixed(1)}%`);
  
  return {
    overallAutomation,
    faqAvgTime,
    aiAvgTime,
    categoryBreakdown: results
  };
}

// Also test analytics endpoints
async function testAnalyticsEndpoints() {
  console.log('\n🔍 Testing Analytics Endpoints...\n');
  
  try {
    const analyticsResponse = await axios.get(`${API_BASE_URL}/chatbot/analytics?timeframe=day`);
    console.log('✅ Analytics endpoint working');
    
    const benchmarkResponse = await axios.get(`${API_BASE_URL}/chatbot/benchmark?timeframe=day`);
    console.log('✅ Benchmark endpoint working');
    console.log('\n📈 Sample benchmark data:', JSON.stringify(benchmarkResponse.data.data, null, 2));
    
  } catch (error) {
    console.error('❌ Analytics endpoint error:', error.message);
  }
}

// Run simulation
runWorkloadSimulation()
  .then(testAnalyticsEndpoints)
  .catch(console.error);
