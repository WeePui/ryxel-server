import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import Order from "../models/orderModel";
import Product from "../models/productModel";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/AppError";
import ShippingAddress from "../models/shippingAddressModel";
import {
  calculateShippingFee,
  getExpectedDeliveryDate,
  createShippingOrder as createShippingOrderGHN,
} from "../utils/ghnService";
import { refundStripePayment, refundZaloPayPayment } from "./paymentController";
import { verifyDiscount } from "./discountController";
import APIFeatures from "../utils/apiFeatures";
import { getLineItemsInfo } from "../utils/getLineItemsInfo";
import XLSX from "xlsx";
import { generateEmail, mainContent } from "../utils/generateEmailTemplate";
import sendEmail from "../utils/email";
import Cart from "../models/cartModel";
import {
  sendOrderCreatedNotification,
  sendOrderStatusUpdatedNotification,
  sendOrderShippedNotification,
  sendOrderDeliveredNotification,
  sendOrderCancelledNotification,
} from "../utils/notificationHelpers";

export const removeCartItem = async (
  userId: string,
  orderItems: any,
  session?: mongoose.ClientSession
) => {
  const cart = await Cart.findOne({ user: userId }).session(session ?? null);
  if (!cart) throw new AppError("No cart found for this user", 404);

  await cart.removeCartItems(orderItems); // sử dụng method mới
};


const reduceStock = async (
  orderItems: any,
  session?: mongoose.ClientSession // Optional session parameter
) => {
  for (const item of orderItems) {
    const product = await Product.findById(item.product).session(
      session ?? null
    ); // Use session if provided
    if (!product) throw new AppError("No product found with that ID", 404);

    const variant = product.variants.find(
      (v) => v._id.toString() === item.variant
    );
    if (!variant) throw new AppError("No variant found with that ID", 404);

    variant.stock -= item.quantity;
    variant.sold += item.quantity;
    product.sold += item.quantity;

    await product.save({ session: session ?? null }); // Save with session if provided
  }
};

const increaseStock = async (
  orderItems: any,
  session?: mongoose.ClientSession // Optional session parameter
) => {
  for (const item of orderItems) {
    const product = await Product.findById(item.product).session(
      session ?? null
    ); // Use session if provided
    if (!product) throw new AppError("No product found with that ID", 404);

    const variant = product.variants.find(
      (v) => v._id.toString() === item.variant.toString()
    );
    if (!variant) throw new AppError("No variant found with that ID", 404);

    variant.stock += item.quantity;
    if (variant.sold && variant.sold >= item.quantity)
      variant.sold -= item.quantity;
    if (product.sold && product.sold >= item.quantity)
      product.sold -= item.quantity;

    await product.save({ session: session ?? null }); // Save with session if provided
  }
};

export const changeOrderStatus = async (orderID: string, status: string) => {
  try {
    const order = await Order.findByIdAndUpdate(
      new mongoose.Types.ObjectId(orderID),
      { status: status },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!order) {
      throw new AppError("No order found with that ID", 404);
    }

    await order.save();
    if (status === "cancelled") {
      await increaseStock(order.lineItems);
    }
  } catch (error) {
    console.error("Error updating order status:", error);
  }
};

export const getShippingFee = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { toDistrictCode, toWardCode } = req.query;
    const { lineItems } = req.body;

    const shippingItems = await getLineItemsInfo(lineItems);
    const totalWeight = shippingItems.reduce(
      (acc: number, item: any) => acc + item.variant.weight * item.quantity,
      0
    );
    const ghnItems = shippingItems.map((item: any) => ({
      name: item.variant.name,
      quantity: item.quantity,
      code: item.variant.sku,
      price: item.variant.price,
      weight: item.variant.weight,
      length: item.variant.dimension.length,
      width: item.variant.dimension.width,
      height: item.variant.dimension.height,
      category: {
        level1: "Hàng Công Nghệ",
      },
    }));

    if (!toDistrictCode || !toWardCode) {
      return next(new AppError("Missing required parameters", 400));
    }

    const { shippingFee, serviceId } = await calculateShippingFee(
      Number(toDistrictCode),
      toWardCode as string,
      totalWeight,
      ghnItems
    );

    if (shippingFee === -1) {
      return next(new AppError("Address is invalid", 400));
    }

    const expectedDeliveryDate = await getExpectedDeliveryDate(
      serviceId!,
      Number(toDistrictCode),
      toWardCode as string
    );

    res.status(200).json({
      status: "success",
      data: {
        shippingFee,
        expectedDeliveryDate,
      },
    });
  }
);

// Create a new order
export const createOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const unpaidOrder = await Order.findOne({
      user: req.user.id,
      status: "unpaid",
    });

    if (unpaidOrder) {
      return next(
        new AppError(
          "You have an unpaid order. Please complete the payment",
          400
        )
      );
    }

    const session = await mongoose.startSession(); // Start a session
    session.startTransaction(); // Start a transaction

    try {
      const shippingAddressId = req.body.address;
      const paymentMethod = req.body.paymentMethod;
      const userId = req.user.id;
      const orderItems = req.body.lineItems;
      const code = req.body.code;

      let status = "unpaid";
      if (paymentMethod === "cod") {
        status = "pending";
      }

      const orderProducts = orderItems.map((item: any) => ({
        product: item.product,
        variant: item.variant,
        quantity: item.quantity,
      }));

      const {
        isValid: discountValid,
        discountAmount,
        discountCode,
      } = await verifyDiscount(code, orderItems, userId);

      const shippingAddress = await ShippingAddress.findOne({
        _id: shippingAddressId,
      });
      if (!shippingAddress)
        throw new AppError("No shipping address found", 400);

      const shippingItems = await getLineItemsInfo(orderItems);
      const totalWeight = shippingItems.reduce(
        (acc: number, item: any) => acc + item.variant.weight * item.quantity,
        0
      );
      const ghnItems = shippingItems.map((item: any) => ({
        name: item.variant.name,
        quantity: item.quantity,
        code: item.variant.sku,
        price: item.variant.price,
        weight: item.variant.weight,
        length: item.variant.dimension.length,
        width: item.variant.dimension.width,
        height: item.variant.dimension.height,
        category: {
          level1: "Hàng Công Nghệ",
        },
      }));

      const { shippingFee, serviceId } = await calculateShippingFee(
        shippingAddress.district.code,
        shippingAddress.ward.code,
        totalWeight,
        ghnItems
      );
      if (shippingFee === -1)
        return next(new AppError("Address is invalid", 400));

      const newOrder = await Order.create(
        [
          {
            user: userId,
            paymentMethod,
            shippingAddress: shippingAddress,
            shippingFee,
            status,
            ...(discountValid &&
              discountAmount !== 0 && { discount: discountCode, discountAmount }),
            lineItems: orderProducts,
          },
        ],
        { session } // Pass the session to the create method
      );

      if (paymentMethod === "cod") {
        await removeCartItem(userId, orderProducts, session).catch((err) => {
          console.error("Error removing cart items:", err);
        });
      }
      await reduceStock(orderProducts, session);
      await session.commitTransaction(); // Commit the transaction
      session.endSession();

      sendOrderConfirmationEmail(newOrder[0]);

      // Send notification for order creation
      try {
        sendOrderCreatedNotification({
          _id: newOrder[0]._id.toString(),
          userId: userId,
          orderCode: newOrder[0].orderCode,
          status: newOrder[0].status,
          totalAmount: newOrder[0].total,
        });
      } catch (notificationError) {
        console.error(
          "Error sending order created notification:",
          notificationError
        );
        // Don't fail the order creation if notification fails
      }

      res.status(201).json({
        status: "success",
        data: {
          order: newOrder[0],
        },
      });
    } catch (err) {
      await session.abortTransaction(); // Roll back transaction in case of error
      session.endSession();

      console.error("Error creating order:", err);

      return next(
        new AppError(`Cannot process the order: ${(err as Error).message}`, 400)
      );
    }
  }
);

// Get an order by ID
export const getOrderByID = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findById(req.params.id)
      .populate("user")
      .populate("shippingAddress")
      .populate("lineItems.product")
      .populate("lineItems.review");

    if (!order) return next(new AppError("Order not found", 404));

    console.log("Order found:", order);

    if (req.user.role === "admin")
      res.status(200).json({
        status: "success",
        data: {
          order,
        },
      });

    if (order.user._id.toString() !== req.user.id)
      return next(
        new AppError("You are not authorized to access this order", 403)
      );

    res.status(200).json({
      status: "success",
      data: {
        order,
      },
    });
  }
);

// Update an order by ID
export const updateOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!order) {
      return next(new AppError("No order found with that ID", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        order,
      },
    });
  }
);

// Delete an order by ID
export const deleteOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      return next(new AppError("No order found with that ID", 404));
    }

    res.status(204).json({
      status: "success",
      data: null,
    });
  }
);

// Get all orders from user side
export const getAllOrders = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { status, paymentMethod, total, startDate, endDate } = req.query;

    // Build the query object
    let query: any = {};

    // Handle status array
    if (status) {
      const statusArray = (status as string).split(",");
      query.status = { $in: statusArray };
    }

    // Handle paymentMethod array
    if (paymentMethod) {
      const paymentMethodArray = (paymentMethod as string).split(",");
      query.paymentMethod = { $in: paymentMethodArray };
    }

    // Handle total range
    if (total) {
      const totalRange = (total as string).split("-");
      query.total = {};

      if (totalRange[0]) {
        query.total.$gte = Number(totalRange[0]);
      }
      if (totalRange[1]) {
        query.total.$lte = Number(totalRange[1]);
      }
    }

    // Handle date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate as string);
      }
    }

    // Count total results before pagination
    const totalResults = await Order.countDocuments(query);
    // Get resultsPerPage from limit query or set default
    const resultsPerPage = Number(req.query.limit) || 12;

    let apiFeatures = new APIFeatures(Order.find(query), req.query);
    apiFeatures = await apiFeatures.search();
    apiFeatures.paginate();

    const orders = await apiFeatures.query
      .populate("user")
      .populate("lineItems.product");

    res.status(200).json({
      status: "success",
      data: {
        orders,
        resultsPerPage,
        totalResults,
      },
    });
  }
);

// Get 1 user orders
export const getUserOrders = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user.id;
    const { status, startDate, endDate } = req.query;

    // Build the query object
    let query: any = { user: user };

    if (status) {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate as string);
      }
    }

    let apiFeatures = new APIFeatures(Order.find({ user }), req.query).sort();
    apiFeatures = await apiFeatures.search();

    const orders = await apiFeatures.query
      .populate("user")
      .populate("lineItems.product");

    res.status(200).json({
      status: "success",
      data: {
        orders,
      },
    });
  }
);

export const getAdminOrders = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    let apiFeatures = new APIFeatures(Order.find(), req.query);
    apiFeatures = await apiFeatures.search();

    const totalResults = await apiFeatures.count();

    const orders = await apiFeatures.query
      .populate("user")
      .populate("lineItems.product");

    res.status(200).json({
      status: "success",
      data: {
        totalResults,
        orders,
      },
    });
  }
);

// Cancel an order by ID from user side
export const cancelOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return next(new AppError("No order found with that ID", 404));
    }

    if (order.status !== "unpaid" && order.status !== "pending") {
      return next(new AppError("Order cannot be cancelled", 400));
    }

    const session = await mongoose.startSession(); // Start a session
    session.startTransaction(); // Start a transaction

    try {
      if (order.status !== "unpaid") {
        // Check if the order was placed more than 30 minutes ago
        const currentTime = new Date();
        const orderTime = new Date(order.createdAt);
        const timeDifference =
          (currentTime.getTime() - orderTime.getTime()) / (1000 * 60); // Time difference in minutes

        if (timeDifference > 30) {
          return next(
            new AppError(
              "Order cannot be cancelled after 30 minutes from the order time",
              400
            )
          );
        }
      }
      order.status = "cancelled";

      await increaseStock(order.lineItems, session);
      await order.save({ session });

      await session.commitTransaction();

      // Send cancellation notification
      try {
        sendOrderCancelledNotification(
          {
            _id: order._id.toString(),
            userId: order.user.toString(),
            orderCode: order.orderCode,
            status: order.status,
            totalAmount: order.total,
          },
          "Đơn hàng đã được hủy theo yêu cầu của khách hàng"
        );
      } catch (notificationError) {
        console.error(
          "Error sending order cancellation notification:",
          notificationError
        );
        // Don't fail the cancellation if notification fails
      }

      res.status(200).json({
        status: "success",
        data: {
          order,
          message: "Order cancelled successfully",
        },
      });
    } catch (err) {
      await session.abortTransaction(); // Roll back transaction in case of error
      session.endSession();
      return next(
        new AppError("Error occurred while cancelling the order", 400)
      ); // Pass the error to the next middleware
    }
  }
);

// Update order status
export const updateOrderStatus = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return next(new AppError("No order found with that ID", 404));
    } // Store old status for notification
    const oldStatus = order.status;

    // Update the order status
    order.status = req.body.status;
    order.adminNotes = req.body.adminNotes;
    await order.save();
    if (order.status === "cancelled") await increaseStock(order.lineItems);

    // Send appropriate notifications based on status change
    try {
      const orderData = {
        _id: order._id.toString(),
        userId: order.user.toString(),
        orderCode: order.orderCode,
        status: order.status,
        totalAmount: order.total,
      };

      if (order.status === "shipped" && oldStatus !== "shipped") {
        await sendOrderShippedNotification(orderData, {
          trackingNumber: order.shippingTracking?.ghnOrderCode,
          carrier: "GHN",
        });
      } else if (order.status === "delivered" && oldStatus !== "delivered") {
        await sendOrderDeliveredNotification(orderData);
      } else if (order.status === "cancelled" && oldStatus !== "cancelled") {
        await sendOrderCancelledNotification(orderData, req.body.adminNotes);
      } else {
        // For other status updates
        await sendOrderStatusUpdatedNotification(
          orderData,
          oldStatus,
          order.status,
          req.body.adminNotes
        );
      }
    } catch (notificationError) {
      console.error(
        "Error sending order status update notification:",
        notificationError
      );
      // Don't fail the status update if notification fails
    }

    res.status(200).json({
      status: "success",
      data: {
        order,
      },
    });
  }
);

export const checkUnpaidOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const unpaidOrder = await Order.findOne({
      user: new mongoose.Types.ObjectId(req.user.id), // Cast to ObjectId
      status: "unpaid",
    });

    if (!unpaidOrder) {
      return res.status(404).json({
        status: "fail",
        message: "No unpaid order found for this user",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        unpaidOrder,
      },
    });
  }
);

export const getOrderByOrderCode = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const orderCode = req.params.code;
    const currentUser = req.user;
    let query = { orderCode };

    // Nếu không phải admin, chỉ tìm order thuộc về chính user
    if (currentUser.role !== "admin") {
      Object.assign(query, { user: currentUser.id });
    }

    const order = await Order.findOne(query)
      .populate("user")
      .populate("lineItems.product")
      .populate("lineItems.review");

    if (!order) {
      return next(new AppError("No order found with that code", 404));
    }

    res.status(200).json({
      status: "success",
      data: {
        order,
      },
    });
  }
);

export const addPaymentId = async (
  orderId: string,
  checkout: { paymentId: string; checkoutId: string; amount: number }
) => {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError("No order found with that ID", 404);
  }

  order.checkout = {
    paymentId: checkout.paymentId,
    checkoutId: checkout.checkoutId,
    amount: checkout.amount,
  };
  await order.save();
};

const calculateTotalWeight = async (orderItems: any) => {
  let totalWeight = 0;

  for (const item of orderItems) {
    const product = await Product.findById(item.product);
    if (!product) throw new AppError("No product found with that ID", 404);

    const variant = product.variants.find(
      (v) => v._id.toString() === item.variant.toString()
    );

    if (!variant) throw new AppError("No variant found with that ID", 404);

    if (!variant.weight) throw new AppError("No weight found for variant", 404);
    totalWeight += variant.weight * item.quantity;
  }

  if (totalWeight <= 1000) totalWeight = 1000;

  return totalWeight;
};

export const createShippingOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);

    if (!order) {
      return next(new AppError("No order found with that ID", 404));
    }

    if (order.status !== "pending") {
      return next(new AppError("Order is not in pending status", 400));
    }

    const shippingAddress = await ShippingAddress.findById(
      order.shippingAddress
    );
    if (!shippingAddress) {
      return next(new AppError("No shipping address found", 400));
    }

    const orderItems = order.lineItems.map((item: any) => ({
      product: item.product,
      variant: item.variant,
      quantity: item.quantity,
    }));

    const lineItems = await getLineItemsInfo(orderItems);
    const totalWeight = lineItems.reduce(
      (acc: number, item: any) => acc + item.variant.weight * item.quantity,
      0
    );
    const ghnItems = lineItems.map((item: any) => ({
      name: item.variant.name,
      quantity: item.quantity,
      code: item.variant.sku,
      price: item.variant.price,
      weight: item.variant.weight,
      length: item.variant.dimension.length,
      width: item.variant.dimension.width,
      height: item.variant.dimension.height,
      category: {
        level1: "Hàng Công Nghệ",
      },
    }));

    const shippingOrder = await createShippingOrderGHN({
      toName: shippingAddress.fullname,
      toPhone: shippingAddress.phoneNumber,
      toAddress: shippingAddress.address,
      toWardName: shippingAddress.ward.name,
      toDistrictName: shippingAddress.district.name,
      toDistrictCode: shippingAddress.district.code,
      toProvinceName: shippingAddress.city.name,
      clientOrderCode: order.orderCode,
      weight: totalWeight,
      lineItems: ghnItems,
    });

    const { data } = shippingOrder;

    order.status = "processing";

    order.shippingTracking = {
      ghnOrderCode: data.order_code,
      expectedDeliveryDate: data.expected_delivery_time,
      trackingStatus: "ready_to_pick",
      statusHistory: [
        {
          status: "ready_to_pick",
          description: "Đơn vận đã được tạo và sẵn sàng để lấy",
          timestamp: new Date(),
        },
      ],
    };
    await order.save();

    // Send notification for shipping order creation (status change to processing)
    try {
      await sendOrderStatusUpdatedNotification(
        {
          _id: order._id.toString(),
          userId: order.user.toString(),
          orderCode: order.orderCode,
          status: order.status,
          totalAmount: order.total,
        },
        "pending",
        "processing",
        "Đơn hàng đã được tạo vận đơn và đang được chuẩn bị"
      );
    } catch (notificationError) {
      console.error(
        "Error sending shipping order notification:",
        notificationError
      );
      // Don't fail the shipping order creation if notification fails
    }

    res.status(200).json({
      status: "success",
      data: {
        shippingOrder,
      },
    });
  }
);

export const refundOrder = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const orderId = req.params.id;
    const order = await Order.findById(orderId);

    if (!order) {
      return next(new AppError("No order found with that ID", 404));
    }

    if (order.status === "unpaid") {
      return next(new AppError("Order is unpaid, cannot be refunded", 400));
    }
    if (order.status === "refunded") {
      return next(new AppError("Order is already refunded", 400));
    }

    if (order.paymentMethod === "stripe") {
      await refundStripePayment(
        order.checkout!.paymentId,
        order.checkout!.amount
      );
    } else if (order.paymentMethod === "zalopay") {
      await refundZaloPayPayment(
        order.checkout!.paymentId,
        order.checkout!.amount
      );
    }
    order.status = "refunded";

    await order.save();
    await increaseStock(order.lineItems);
    res.status(200).json({
      status: "success",
      message: "Order refunded successfully",
      data: {
        order,
      },
    });
  }
);

export const exportOrderExcel = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { code } = req.params;
    console.log("Exporting order with code:", code);

    const order = await Order.findOne({ orderCode: code })
      .populate("user")
      .populate("lineItems.product")
      .populate("lineItems.review");

    if (!order) {
      console.log("Order not found");
      return res.status(404).send("Order not found");
    }

    const shipping = order.shippingAddress as any;

    const data = [
      ["Mã đơn hàng:", order.orderCode],
      ["Ngày đặt:", new Date(order.createdAt).toLocaleDateString("vi-VN")],
      ["Khách hàng:", `${shipping.fullname} (${(order.user as any).name})`],
      ["SĐT:", shipping.phoneNumber],
      [
        "Địa chỉ:",
        `${shipping.address}, ${shipping.ward.name}, ${shipping.district.name}, ${shipping.city.name}`,
      ],
      [], // dòng trống
      ["Sản phẩm", "Số lượng", "Đơn giá", "Thành tiền"], // tiêu đề
      ...order.lineItems.map((item) => [
        (item.product as any).name,
        item.quantity,
        item.unitPrice,
        item.subtotal,
      ]),
      [], // dòng trống
      ["Tạm tính", "", "", order.subtotal],
      ["Phí vận chuyển", "", "", order.shippingFee],
      ...(order.discountAmount > 0
        ? [["Giảm giá", "", "", -order.discountAmount]]
        : []),
      ["Tổng cộng", "", "", order.total],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set width cột
    ws["!cols"] = [
      { wch: 40 }, // Sản phẩm
      { wch: 10 }, // Số lượng
      { wch: 15 }, // Đơn giá
      { wch: 20 }, // Thành tiền
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Đơn hàng");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=order-${code}.xlsx`,
    });
    res.send(buffer);
  }
);

const sendOrderConfirmationEmail = async (order: any) => {
  // Lấy thông tin đơn hàng với đầy đủ chi tiết sản phẩm và biến thể
  const populatedOrder = await Order.findById(order._id)
    .populate("user")
    .populate({
      path: "lineItems.product",
      select: "name imageCover variants", // Thêm variants để lấy thông tin biến thể
    });

  if (!populatedOrder) {
    throw new AppError("No order found with that ID", 404);
  }

  // Chuẩn bị dữ liệu cho template với thông tin variant đầy đủ
  const orderItems = populatedOrder.lineItems.map((item) => {
    // Tìm variant chính xác từ sản phẩm
    const product = item.product as any;
    const variant = product.variants.find(
      (v: any) => v._id.toString() === item.variant.toString()
    );

    return {
      product: {
        name: product.name,
        imageCover: product.imageCover,
      },
      variant: {
        name: variant?.name || item._itemName || "Phân loại mặc định",
        images: variant?.images || [product.imageCover], // Sử dụng ảnh của variant hoặc dùng ảnh bìa nếu không có
        sku: variant?.sku || "",
      },
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    };
  });

  // Tạo nội dung email
  const html = generateEmail({
    subject: `Thông tin đơn hàng #${order.orderCode}`,
    greetingName: (populatedOrder.user as any).name,
    mainContent: mainContent.orderConfirmation(
      populatedOrder,
      populatedOrder.shippingAddress,
      orderItems
    ),
  });

  // Gửi email
  await sendEmail({
    to: (populatedOrder.user as any).email,
    subject: `Thông tin đơn hàng #${order.orderCode}`,
    html,
  });
};

export const resendOrderEmail = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const order = await Order.findById(id);

    if (!order) {
      return next(new AppError("No order found with that ID", 404));
    }

    await sendOrderConfirmationEmail(order);

    res.status(200).json({
      status: "success",
      message: "Order confirmation email sent successfully",
    });
  }
);
