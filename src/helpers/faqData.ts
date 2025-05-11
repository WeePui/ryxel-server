import { keys } from 'lodash';

export const faqMap = [
  {
    keys: ['đặt hàng', 'mua hàng', 'cách mua', 'mua như thế nào'],
    answer: `
1. Đăng nhập vào tài khoản (hoặc đăng ký nếu chưa có).
2. Chọn sản phẩm và thêm vào giỏ hàng.
3. Vào trang giỏ hàng, chọn sản phẩm muốn thanh toán.
4. Bấm "Tiến hành đặt hàng".
5. Chọn địa chỉ giao hàng, phương thức thanh toán.
6. Kiểm tra lại đơn và bấm "Tiến hành thanh toán".`,
  },
  {
    keys: ['huỷ đơn', 'hủy đơn', 'hủy đơn hàng', 'huỷ đơn hàng', 'bỏ đơn'],
    answer: `
1. Đăng nhập vào tài khoản của bạn.
2. Truy cập mục "Đơn hàng".
3. Chọn đơn muốn huỷ (chỉ huỷ được khi chưa giao hàng, không quá 30 phút kể từ khi đặt hàng).
4. Bấm "Huỷ đơn hàng" và chọn lý do.`,
  },
  {
    keys: [
      'thanh toán',
      'cách thanh toán',
      'phương thức thanh toán',
      'trả tiền',
    ],
    answer: `Ryxel Store hỗ trợ các hình thức thanh toán:
- Chuyển khoản ngân hàng (qua cổng ZaloPay)
- Thẻ tín dụng/ghi nợ (qua Stripe hoặc ZaloPay)
- Thanh toán khi nhận hàng (COD).`,
  },
  {
    keys: [
      'giao hàng',
      'nhận hàng',
      'địa chỉ giao hàng',
      'địa chỉ nhận hàng',
      'vận chuyển',
      'phí ship',
      'phí vận chuyển',
    ],
    answer: `Phí vận chuyển sẽ được tính tự động dựa trên địa chỉ nhận hàng.`,
  },
  {
    keys: ['liên hệ', 'hotline', 'số điện thoại', 'gọi điện', 'vấn đề'],
    answer: `Anh/chị có thể liên hệ Ryxel Store qua:
- Hotline: 0912 823 283 (8:00 - 17:00 hằng ngày)
- Email: bhtcag@gmail.com
- Facebook: https://www.facebook.com/weepui.bh/
- Địa chỉ: 1 Võ Văn Ngân, p.Linh Trung, TP.Thủ Đức, TP.HCM`,
  },
  {
    keys: ['bảo hành', 'đổi trả', 'đổi hàng', 'trả hàng', 'bảo trì'],
    answer: `
Tất cả sản phẩm tại Ryxel Store đều được **bảo hành chính hãng 12 tháng**.
Chính sách đổi trả:
- Đổi trả trong 7 ngày nếu sản phẩm lỗi do nhà sản xuất.
- Không áp dụng đổi trả với sản phẩm đã qua sử dụng không lỗi.`,
  },
  {
    keys: ['giờ mở cửa', 'giờ làm việc', 'làm việc lúc nào', 'mấy giờ mở cửa'],
    answer: `
Ryxel Store mở cửa từ **8:00 đến 20:00**, tất cả các ngày trong tuần (kể cả Chủ Nhật).`,
  },
  {
    keys: ['bảo hành', 'đổi trả', 'đổi hàng', 'trả hàng', 'bảo trì', 'hư hỏng'],
    answer: `
Tất cả sản phẩm tại Ryxel Store đều được **bảo hành chính hãng** dựa theo chính sách bảo hành của hãng.
Chính sách đổi trả:
- Nếu có bất kì khiếu nại gì bạn có thể gửi hàng đến Ryxel Store.
- Chúng tôi chỉ hỗ trợ chuyển sản phẩm đến trung tâm bảo hành của hãng.
- Không áp dụng đổi trả với sản phẩm đã qua sử dụng không lỗi.`,
  },
  {
    keys: ['giờ mở cửa', 'giờ làm việc', 'làm việc lúc nào', 'mấy giờ mở cửa'],
    answer: `
Ryxel Store mở cửa từ **8:00 đến 17:00**, tất cả các ngày trong tuần (kể cả Chủ Nhật).`,
  },
];
