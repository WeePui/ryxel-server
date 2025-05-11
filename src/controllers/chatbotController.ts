import { faqMap } from '../helpers/faqData';
import catchAsync from '../utils/catchAsync';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.ALIBABA_MODEL_API_KEY,
  baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
});

const systemPrompt = `
Bạn là nhân viên tư vấn của Ryxel Store — một cửa hàng chuyên bán gaming gear (chuột, bàn phím, tai nghe, ghế gaming, v.v...).
Hãy trả lời khách hàng như một nhân viên chăm sóc khách hàng tận tâm, thân thiện, ngắn gọn và rõ ràng.
Chỉ trả lời dựa trên thông tin của Ryxel Store. Nếu không chắc chắn hoặc không biết câu trả lời, hãy nói "Hiện tại em chưa có thông tin chính xác về vấn đề này, anh/chị có thể liên hệ hotline hoặc inbox fanpage để được hỗ trợ thêm nhé."
Không bịa thêm thông tin về sản phẩm, phương thức thanh toán, phí vận chuyển, hay chính sách nếu chưa có sẵn trong câu hỏi hoặc trong dữ liệu cửa hàng.
Luôn xưng hô anh/chị cho lịch sự, không dùng từ ngữ suồng sã.
`;

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

export const getChatbotResponse = catchAsync(async (req, res) => {
  const userMessage = req.body.message;
  const matchedFAQ = getRelevantFAQ(userMessage);

  const baseMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  if (matchedFAQ) {
    baseMessages.push({
      role: 'assistant',
      content: `Thông tin chính xác từ Ryxel Store cho câu hỏi này:\n${matchedFAQ}`,
    });
  }

  const completion = await openai.chat.completions.create({
    model: 'qwen-turbo',
    messages: baseMessages,
  });

  const response = completion.choices[0].message.content;

  res.status(200).json({
    status: 'success',
    data: {
      response,
    },
  });
});
