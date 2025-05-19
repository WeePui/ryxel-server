interface GenerateEmailOptions {
  subject?: string;
  greetingName?: string;
  mainContent: string; // HTML content
  extraContent?: string; // HTML content
  footerContent?: string; // HTML content
}

export function generateEmail({
  subject = 'Ryxel Store',
  greetingName = '',
  mainContent,
  extraContent = '',
  footerContent = '',
}: GenerateEmailOptions): string {
  return `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${subject}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap" rel="stylesheet" />
      <style>
        html { 
            height: 100%;
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-size: 16px; 
        }
        body {
            font-family: 'Manrope', Arial, sans-serif;
            background-color: #f4f4f4;
            color: #333;
            margin: 0 auto;
            max-width: 600px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            border-radius: 1rem;
        }
        h4 {
            margin-top: 1rem;
            margin-bottom: 0;
        }
        main { padding: 1.2rem; }
        .logo-container {
          display: flex; justify-content: center; align-items: center;
          padding: 0.5rem; background-color: #304b65;
        }
        .logo-container img { width: 120px; height: auto; }
        .support-container {
            color: #8c9093; font-size: 0.9rem; padding: 1.2rem; margin-bottom: 3rem;
        }
        .support-container::before {
            content: ''; display: block; width: 100%; height: 1px;
            background-color: #7c797967; margin-bottom: 1rem;
        }
        footer {
            padding: 1.2rem; margin-top: 1rem; margin-bottom: 1rem;
            background-color: #304b65; color: #fff; text-align: center;
            font-size: 0.8rem; font-weight: 400;
        }
        .btn {
            cursor: pointer;
            text-decoration: none;
        }
        .btn a {
            color: #fff;
            text-decoration: none;
            font-weight: 600;
        }
        .btn-primary {
            background-color: #304b65;
            color: #fff;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            font-size: 1rem;
            text-align: center;
            display: inline-block;
            margin-top: 1rem;
        }
        .step-list {
            list-style: decimal;
            font-size: 0.9rem;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .notice-text {
            color: #8c9093;
            font-size: 0.9rem;
        }
        .code {
            font-family: monospace;
            font-size: 3rem;
            background-color: #eaeaea;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            color: #304b65;
        }
        .order-table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }
        .order-table th, .order-table td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        .order-table th {
            background-color: #f2f2f2;
        }
        .order-table .product-img {
            width: 60px;
            height: 60px;
            object-fit: cover;
            border-radius: 4px;
        }
        .product-row {
            
        }
        .summary-box {
            background-color: #f9f9f9;
            border-radius: 0.5rem;
            padding: 1rem;
            margin: 1rem 0;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            margin: 0.5rem 0;
        }
        .summary-label {
            font-weight: 600;
            color: #555;
        }
        .summary-value {
            
        }
        .total-row {
            font-size: 1.1rem;
            border-top: 2px solid #ddd;
            padding-top: 0.5rem;
            margin-top: 0.5rem;
        }
        .shipping-info {
            background-color: #eaf3fb;
            border-radius: 0.5rem;
            padding: 1rem;
            margin: 1rem 0;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8rem;
            font-weight: 600;
            color: white;
        }
        .status-unpaid { background-color: #f59e0b; }
        .status-pending { background-color: #3b82f6; }
        .status-processing { background-color: #8b5cf6; }
        .status-shipped { background-color: #10b981; }
        .status-delivered { background-color: #059669; }
        .status-cancelled { background-color: #ef4444; }
        .status-refunded { background-color: #6b7280; }
        .tracking-box {
        background-color: #f0fdf4;
        border: 1px solid #86efac;
        border-radius: 0.5rem;
        padding: 1rem;
        margin: 1rem 0;
        }
        .mt-y-sm {
            margin-top: 1rem;
            margin-bottom: 1rem;
        }
        .mt-top-md {
            margin-top: 2rem;
        }
      </style>
    </head>
    <body>
      <div class="logo-container">
        <img src="cid:logo" alt="Logo" />
      </div>
      <main>
        ${greetingName ? `<p>Kính gửi <strong>${greetingName}</strong>,</p>` : ''}
        ${mainContent}
        ${extraContent}
      </main>
      <div class="support-container">
        <p>Nếu cần hỗ trợ, vui lòng liên hệ với chúng tôi. Chúng tôi rất vui lòng được hỗ trợ.</p>
        <ul>
          <li>Hỗ trợ kỹ thuật: <a href="mailto:support@example.com">support@example.com</a></li>
          <li>Đặt hàng: <a href="mailto:orders@example.com">orders@example.com</a></li>
          <li>Khác: <a href="mailto:info@example.com">info@example.com</a></li>
        </ul>
        <p>Đây là e-mail tự động, xin vui lòng không phản hồi.</p>
        <p>Trân trọng,</p>
        <a href="https://localhost:3000/">Ryxel Company</a>
      </div>
      <footer>
        ${
          footerContent ||
          `<p>© 2025 Ryxel Store. All rights reserved. Ryxel Inc. Headquarters are in Ho Chi Minh City, Vietnam.</p>
          <p>Địa chỉ: 1 Võ Văn Ngân, Linh Chiểu, Thủ Đức, TP.HCM</p>
          <p>Điện thoại: 0123456789</p>`
        }
      </footer>
    </body>
  </html>
    `;
}

export const mainContent = {
  welcome: () => `
    <p>
        Chân thành cảm ơn bạn đã sử dụng dịch vụ của Ryxel Store. Bạn vừa đăng
        ký tài khoản thành công với email <strong>huy.bui@example.com</strong>.
    </p>
    <p class="mt-top-md">
        Chào mừng bạn đến với Ryxel Store, cửa hàng gaming gear cao cấp hàng đầu
        Võ Văn Ngân, cung cấp các sản phẩm chất lượng cao và dịch vụ tốt nhất để
        đáp ứng nhu cầu của bạn và cam kết mang đến trải nghiệm mua sắm tuyệt
        vời nhất với dịch vụ chăm sóc khách hàng tận tâm và chuyên nghiệp.
    </p>
    <h2 class="mt-y-sm">Các bước tiếp theo để xác thực tài khoản:</h2>
    <p class="notice-text">
        (Vui lòng bỏ qua nếu bạn đã hoàn thành xác thực):
    </p>
    <ul class="step-list">
        <li>
          Truy cập vào trang
          <a href="https://localhost:3000/account">quản lý tài khoản</a> của
          bạn.
        </li>
        <li>Chọn xác thực tài khoản.</li>
        <li>Nhập mã xác thực đã được gửi đến email của bạn.</li>
    </ul>
    <p>
        Sau khi hoàn thành việc xác thực bạn có thể tiến hành sử dụng các dịch
        vụ của chúng tôi như mua hàng, quản lí thông tin giao hàng, danh sách
        yêu thích.
    </p>
    <h4>Các liên kết hữu ích</h4>
    <ul class="step-list">
        <li>
          <a href="https://localhost:3000/account">Quản lý tài khoản</a>
        </li>
        <li>
          <a href="https://localhost:3000/cart">Giỏ hàng</a>
        </li>
        <li>
          <a href="https://localhost:3000/products">Sản phẩm</a>
        </li>
    </ul>
    `,
  sendingOtp: (otp: string) => `
    <p>Chân thành cảm ơn bạn đã sử dụng dịch vụ của Ryxel Store.</p>
    <p>Bạn vui lòng nhập mã xác thực dưới đây để hoàn thành việc xác thực tài khoản.</p>
    <p>Mã xác thực:</p>
    <p class="code mt-y-sm"><strong>${otp}</strong></p>
    <p>Xin lưu ý mã xác thực chỉ có hiệu lực trong vòng 10 phút, quá thời hạn trên sẽ không còn hiệu lực.</p>
    <p class="mt-top-md">Nếu bạn không thực hiện yêu cầu này, có thể tài khoản của bạn đã bị truy cập trái phép bởi bên thứ 3.</p>
    <p>Xin hãy truy cập vào trang quản lý tài khoản của bạn để thay đổi mật khẩu.</p>
    <a href="https://localhost:3000/account/change-password">https://ryxel.com/account/change-password</a>
    `,
  resetPassword: (resetUrl: string) => `
    <p>Chân thành cảm ơn bạn đã sử dụng dịch vụ của Ryxel Store.</p>
    <p>Chúng tôi vừa nhận được yêu cầu khôi phục mật khẩu từ tài khoản Ryxel có liên kết với email của bạn.</p>
    <p>Để hoàn tất việc khôi phục mật khẩu, vui lòng bấm vào nút bên dưới để chuyển sang trang khôi phục mật khẩu.</p>
    <button class="btn btn-primary">
      <a href="https://localhost:3000/account/reset-password/${resetUrl}">Khôi phục mật khẩu</a>
    </button>
    <p class="mt-top-md">Nếu bạn không thực hiện yêu cầu này, có thể tài khoản của bạn đã bị truy cập trái phép bởi bên thứ 3.</p>
    <p>Xin hãy truy cập vào trang quản lý tài khoản của bạn để thay đổi mật khẩu.</p>
    <a href="https://localhost:3000/account/change-password">https://ryxel.com/account/change-password</a>
    `,
  orderConfirmation: (order: any, shippingAddress: any, orderItems: any[]) => {
    // Tạo bảng sản phẩm
    const productsTable = `
          <table class="order-table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Tên</th>
                <th>Số lượng</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${orderItems
                .map(
                  (item) => `
                <tr class="product-row">
                  <td>
                    <img src="${
                      item.variant.images && item.variant.images.length > 0
                        ? item.variant.images[0]
                        : item.product.imageCover
                    }" 
                        alt="${item.product.name}" class="product-img" />
                  </td>
                  <td>
                    <div><strong>${item.product.name}</strong></div>
                    <div>Phân loại: ${item.variant.name}</div>
                  </td>
                  <td>${item.quantity}</td>
                  <td>${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.unitPrice)}</td>
                  <td>${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.subtotal)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        `;

    // Tạo box tổng kết đơn hàng
    const orderSummary = `
          <div class="summary-box">
            <h3>Tổng kết đơn hàng</h3>
            <div class="summary-row">
              <span class="summary-label">Mã đơn hàng:</span>
              <span class="summary-value">${order.orderCode}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Ngày đặt hàng:</span>
              <span class="summary-value">${new Date(order.createdAt).toLocaleDateString('vi-VN')}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Tạm tính:</span>
              <span class="summary-value">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(order.subtotal)}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">Phí vận chuyển:</span>
              <span class="summary-value">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(order.shippingFee)}</span>
            </div>
            ${
              order.discountAmount
                ? `
            <div class="summary-row">
              <span class="summary-label">Giảm giá:</span>
              <span class="summary-value">-${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(order.discountAmount)}</span>
            </div>
            `
                : ''
            }
            <div class="summary-row total-row">
              <span class="summary-label">Tổng cộng:</span>
              <span class="summary-value">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(order.total)}</span>
            </div>
          </div>
        `;

    // Tạo box thông tin giao hàng
    const shippingInfo = `
          <div class="shipping-info">
            <h3>Thông tin giao hàng</h3>
            <div><strong>Người nhận:</strong> ${shippingAddress.fullname}</div>
            <div><strong>Số điện thoại:</strong> ${shippingAddress.phoneNumber}</div>
            <div><strong>Địa chỉ:</strong> ${shippingAddress.address}, ${shippingAddress.ward.name}, ${shippingAddress.district.name}, ${shippingAddress.city.name}</div>
            <div><strong>Phương thức thanh toán:</strong> ${getPaymentMethodText(order.paymentMethod)}</div>
          </div>
        `;

    // Tạo badge trạng thái đơn hàng
    const statusBadge = `
          <h3>Trạng thái đơn hàng</h3>
          <div class="status-badge status-${order.status}">${getOrderStatusText(order.status)}</div>
        `;

    // Tạo tracking info nếu đơn hàng đã ship
    const trackingInfo =
      (order.status === 'shipped' || order.status === 'delivered') &&
      order.shippingTracking &&
      order.shippingTracking.ghnOrderCode
        ? `
          <div class="tracking-box">
            <h3>Thông tin vận chuyển</h3>
            <div><strong>Mã vận đơn:</strong> ${order.shippingTracking.ghnOrderCode}</div>
            ${
              order.shippingTracking.expectedDeliveryDate
                ? `
            <div><strong>Ngày giao hàng dự kiến:</strong> ${new Date(order.shippingTracking.expectedDeliveryDate).toLocaleDateString('vi-VN')}</div>
            `
                : ''
            }
            <div><strong>Trạng thái:</strong> ${getShippingStatusText(order.shippingTracking.trackingStatus)}</div>
            <div><strong>Theo dõi đơn hàng: </strong> <a href="https://tracking.ghn.dev/?order_code=${order.shippingTracking.ghnOrderCode}" target="_blank">Xem tại đây</a></div>
          </div>
        `
        : '';

    return `
          <p>Cảm ơn bạn đã đặt hàng tại Ryxel Store. Dưới đây là thông tin chi tiết về đơn hàng của bạn:</p>
          
          ${statusBadge}
          
          ${trackingInfo}
          
          <h3>Chi tiết đơn hàng</h3>
          ${productsTable}
          
          ${orderSummary}
          
          ${shippingInfo}
          
          <p>Cảm ơn bạn đã tin tưởng và lựa chọn Ryxel Store. Chúng tôi sẽ thông báo cho bạn khi đơn hàng của bạn được xử lý và giao hàng.</p>
          
          <p>Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi qua địa chỉ email <a href="mailto:support@ryxel.com">support@ryxel.com</a>.</p>
        `;
  },
};

function getOrderStatusText(status: string) {
  const statusTexts: Record<string, string> = {
    unpaid: 'Chưa thanh toán',
    pending: 'Chờ xác nhận',
    processing: 'Đang chuẩn bị hàng',
    shipped: 'Đã giao cho đơn vị vận chuyển',
    delivered: 'Đã giao hàng',
    cancelled: 'Đã hủy',
    refunded: 'Đã hoàn tiền',
  };
  return statusTexts[status] || status;
}

function getPaymentMethodText(method: string) {
  const methodTexts: Record<string, string> = {
    cod: 'Thanh toán khi nhận hàng (COD)',
    zalopay: 'Thanh toán qua ZaloPay',
    stripe: 'Thanh toán qua thẻ tín dụng/ghi nợ',
  };
  return methodTexts[method] || method;
}

function getShippingStatusText(status: string) {
  const statusTexts: Record<string, string> = {
    ready_to_pick: 'Đã sẵn sàng để lấy hàng',
    picking: 'Đang lấy hàng',
    picked: 'Đã lấy hàng',
    storing: 'Đang lưu kho',
    delivering: 'Đang giao hàng',
    delivered: 'Đã giao hàng',
    delivery_failed: 'Giao hàng thất bại',
    waiting_to_return: 'Chờ trả hàng',
    return: 'Đang trả hàng',
    returned: 'Đã trả hàng',
    cancelled: 'Đã hủy',
  };
  return statusTexts[status] || status;
}
