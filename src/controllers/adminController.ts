import { Request, Response, NextFunction, query } from "express";
import Product from "../models/productModel";
import Order from "../models/orderModel";
import User from "../models/userModel";
import catchAsync from "../utils/catchAsync";
import AppError from "../utils/AppError";

const predictOutOfStock = async (): Promise<{
  predictions: { product: any; predictedDaysToOutOfStock: number }[];
}> => {
  try {
    const now = new Date(); // Thời gian hiện tại
    const products = await Product.find({}); // Lấy toàn bộ sản phẩm

    const predictions = products
      .map((product) => {
        const totalStock = product.totalStock || 0; // Lấy virtual field, default to 0
        const timeSinceCreation =
          (now.getTime() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24); // Thời gian tính bằng ngày
        const sold = product.sold || 0; // Tổng sản phẩm đã bán được

        // Chỉ tính toán cho sản phẩm có bán và còn hàng
        if (sold === 0 || totalStock === 0) {
          return null;
        }

        // Tính thời gian dự đoán hết hàng
        const predictedDaysToOutOfStock = Math.round(
          totalStock * (timeSinceCreation / sold)
        ); // Làm tròn đến ngày gần nhất

        return {
          product,
          predictedDaysToOutOfStock,
        };
      })
      .filter(
        (item): item is { product: any; predictedDaysToOutOfStock: number } =>
          item !== null
      ) // Type guard để loại bỏ null
      .sort((a, b) => a.predictedDaysToOutOfStock - b.predictedDaysToOutOfStock) // Sắp xếp tăng dần theo thời gian dự đoán
      .slice(0, 10); // Lấy top 10 sản phẩm

    return { predictions };
  } catch (error) {
    throw new AppError(
      "Internal error while predicting out-of-stock products",
      500
    );
  }
};

// Helper function to calculate change rate
const calculateChangeRate = (
  current: number,
  previous: number
): number | null => {
  if (previous === 0) {
    return 0; // Or null if you prefer to represent no change
  }
  const rate = (current - previous) / previous;
  return Math.round(rate * 100) / 100;
};

const getTotalSalebyMonth = async (startDate: Date, endDate: Date) => {
  return (
    (
      await Order.aggregate([
        {
          $match: {
            status: { $nin: ["unpaid", "cancelled"] },
            createdAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: "$total" },
          },
        },
      ])
    )[0]?.totalSales || 0
  );
};

const getTotalOrderbyMonth = async (startDate: Date, endDate: Date) => {
  return (
    (await Order.find({
      status: { $nin: ["unpaid", "cancelled"] },
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    }).countDocuments()) || 0
  );
};

const getTotalUserbyMonth = async (startDate: Date, endDate: Date) => {
  return (
    (await User.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    }).countDocuments()) || 0
  );
};

const getTotalProductbyMonth = async (startDate: Date, endDate: Date) => {
  return (
    (await Product.find({
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
    }).countDocuments()) || 0
  );
};

export const getTime = (range: string, year: number, month?: number) => {
  let startDate: Date;
  let endDate: Date;
  let timeSlots: number[] = [];
  if (range === "day") {
    const now = new Date();
    startDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0
      )
    );
    endDate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );
    timeSlots = Array.from({ length: 7 }, (_, i) => i); // 0–6: Sunday–Saturday
  } else if (range === "month") {
    startDate = new Date(Date.UTC(year, month! - 1, 1));
    endDate = new Date(Date.UTC(year, month!, 0, 23, 59, 59, 999));
    const totalDays = endDate.getUTCDate();
    timeSlots = Array.from({ length: totalDays }, (_, i) => i); // 0–(days-1)
  } else {
    // range === 'year'
    startDate = new Date(Date.UTC(year, 0, 1));
    endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    timeSlots = Array.from({ length: 12 }, (_, i) => i); // 0–11 months
  }

  return { startDate, endDate, timeSlots };
};

export const getDashboard = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // Months are zero-based in JavaScript
    const currentYear = now.getFullYear();

    const thisMonthStartDate = new Date(
      `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`
    );
    const thisMonthEndDate = new Date(
      `${currentYear}-${String(currentMonth).padStart(2, "0")}-${new Date(currentYear, currentMonth, 0).getDate()}`
    ); // Last day of the month

    // Previous month calculations
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1; // Handle January edge case
    const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear; // Handle year edge case

    const previousMonthStartDate = new Date(
      `${previousYear}-${String(previousMonth).padStart(2, "0")}-01`
    );
    const previousMonthEndDate = new Date(
      `${previousYear}-${String(previousMonth).padStart(2, "0")}-${new Date(previousYear, previousMonth, 0).getDate()}`
    ); // Last day of the month

    // Total Products
    const totalProductsValue = (await Product.find().countDocuments()) || 0;

    const totalProductsThisMonth = await getTotalProductbyMonth(
      thisMonthStartDate,
      thisMonthEndDate
    );
    const totalProductsLastMonth = await getTotalProductbyMonth(
      previousMonthStartDate,
      previousMonthEndDate
    );

    const totalProductsChangeRate = calculateChangeRate(
      totalProductsThisMonth,
      totalProductsLastMonth
    );

    // Total Users
    const totalUsersValue = (await User.find().countDocuments()) || 0;

    const totalUsersThisMonth = await getTotalUserbyMonth(
      thisMonthStartDate,
      thisMonthEndDate
    );
    const totalUsersLastMonth = await getTotalUserbyMonth(
      previousMonthStartDate,
      previousMonthEndDate
    );

    const totalUsersChangeRate = calculateChangeRate(
      totalUsersThisMonth,
      totalUsersLastMonth
    );

    // Total Orders (excluding unpaid/cancelled)
    const totalOrdersValue =
      (await Order.find({
        status: { $nin: ["unpaid", "cancelled"] },
      }).countDocuments()) || 0;

    const totalOrdersThisMonth = await getTotalOrderbyMonth(
      thisMonthStartDate,
      thisMonthEndDate
    );
    const totalOrdersLastMonth = await getTotalOrderbyMonth(
      previousMonthStartDate,
      previousMonthEndDate
    );

    const totalOrdersChangeRate = calculateChangeRate(
      totalOrdersThisMonth,
      totalOrdersLastMonth
    );

    // Total Sales
    const totalSalesValue = await Order.calculateTotalSales();

    const totalSalesThisMonth = await getTotalSalebyMonth(
      thisMonthStartDate,
      thisMonthEndDate
    );
    const totalSalesLastMonth = await getTotalSalebyMonth(
      previousMonthStartDate,
      previousMonthEndDate
    );
    const totalSalesChangeRate = calculateChangeRate(
      totalSalesThisMonth,
      totalSalesLastMonth
    );

    // Structure the response
    res.status(200).json({
      status: "success",
      data: {
        sales: {
          value: totalSalesValue,
          changeRate: totalSalesChangeRate,
        },
        totalProducts: {
          value: totalProductsValue,
          changeRate: totalProductsChangeRate,
        },
        totalUsers: {
          value: totalUsersValue,
          changeRate: totalUsersChangeRate,
        },
        totalOrders: {
          value: totalOrdersValue,
          changeRate: totalOrdersChangeRate,
        },
      },
    });
  }
);

export const getRecentOrders = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // Fetch the 10 most recent orders
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 }) // Sort by creation date in descending order
      .limit(10) // Limit to 10 orders;
      .populate("user")
      .populate("shippingAddress")
      .populate("lineItems.product");
    // Respond with all attributes of the orders

    res.status(200).json({
      status: "success",
      data: recentOrders,
    });
  }
);

export const getRevenue = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    console.log(req.query);
    const range = req.query.range as string;

    // Only validate the range parameter
    if (!range || !["day", "month", "year"].includes(range)) {
      return res.status(400).json({
        status: "fail",
        message:
          'Invalid or missing "range" parameter. Must be one of: day, month, year',
      });
    }

    // Always use current date if not specified
    const now = new Date();
    const year =
      req.query.year && !isNaN(parseInt(req.query.year as string))
        ? parseInt(req.query.year as string)
        : now.getFullYear();
    const month =
      req.query.month && !isNaN(parseInt(req.query.month as string))
        ? parseInt(req.query.month as string)
        : now.getMonth() + 1; // 1-based month

    let matchFilter: any = {};
    const { startDate, endDate, timeSlots } = getTime(range, year, month);

    matchFilter = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: { $nin: ["unpaid", "cancelled"] },
    };

    const revenueData = await Order.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id:
            range === "day"
              ? {
                  $dayOfWeek: {
                    date: "$createdAt",
                    timezone: "Asia/Ho_Chi_Minh",
                  },
                } // 1 (Sunday) – 7 (Saturday)
              : range === "month"
                ? {
                    $dayOfMonth: {
                      date: "$createdAt",
                      timezone: "Asia/Ho_Chi_Minh",
                    },
                  } // 1–31
                : {
                    $month: {
                      date: "$createdAt",
                      timezone: "Asia/Ho_Chi_Minh",
                    },
                  }, // 1–12
          totalRevenue: { $sum: "$subtotal" },
        },
      },
    ]);

    // Fill in missing dates or months with 0
    const responseData = timeSlots.map((slot, index) => {
      const found = revenueData.find((item) => item._id === index + 1);
      return {
        name: index, // Use 1-based index (1 for first day or month)
        value: found ? found.totalRevenue : 0,
      };
    });

    res.status(200).json({
      status: "success",
      data: {
        revenue: responseData,
      },
    });
  }
);

export const getTopCustomers = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const range = req.query.range as string;

    // Only validate the range parameter
    if (!range || !["day", "month", "year"].includes(range)) {
      return res.status(400).json({
        status: "fail",
        message:
          'Invalid or missing "range" parameter. Must be one of: day, month, year',
      });
    }

    // Always use current date if not specified
    const now = new Date();
    const year =
      req.query.year && !isNaN(parseInt(req.query.year as string))
        ? parseInt(req.query.year as string)
        : now.getFullYear();
    const month =
      req.query.month && !isNaN(parseInt(req.query.month as string))
        ? parseInt(req.query.month as string)
        : now.getMonth() + 1; // 1-based month

    // Calculate date range
    const { startDate, endDate } = getTime(range, year, month);

    // Aggregation pipeline
    const topCustomers = await Order.aggregate([
      {
        $match: {
          status: { $nin: ["unpaid", "cancelled"] },
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$user",
          totalSpent: { $sum: "$subtotal" },
          totalOrders: { $sum: 1 },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 5 },
    ]);

    // Populate user data
    const users = await Promise.all(
      topCustomers.map(async (customer) => {
        const user = await User.findById(customer._id).select(
          "name email photo"
        );
        return {
          user,
          totalSpent: customer.totalSpent,
          totalOrders: customer.totalOrders,
        };
      })
    );

    res.status(200).json({
      status: "success",
      data: { users },
    });
  }
);

export const getProductsSold = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const range = req.query.range as string;

    // Only validate the range parameter
    if (!range || !["day", "month", "year"].includes(range)) {
      return res.status(400).json({
        status: "fail",
        message:
          'Invalid or missing "range" parameter. Must be one of: day, month, year',
      });
    }

    // Always use current date if not specified
    const now = new Date();
    const year =
      req.query.year && !isNaN(parseInt(req.query.year as string))
        ? parseInt(req.query.year as string)
        : now.getFullYear();
    const month =
      req.query.month && !isNaN(parseInt(req.query.month as string))
        ? parseInt(req.query.month as string)
        : now.getMonth() + 1; // 1-based month

    // Setup time range
    const { startDate, endDate, timeSlots } = getTime(range, year, month);

    // Run aggregation
    const productsSold = await Order.aggregate([
      {
        $match: {
          status: { $nin: ["unpaid", "cancelled"] },
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $unwind: "$lineItems" },
      {
        $group: {
          _id:
            range === "day"
              ? {
                  $dayOfWeek: {
                    date: "$createdAt",
                    timezone: "Asia/Ho_Chi_Minh",
                  },
                } // 1 (Sunday) – 7 (Saturday)
              : range === "month"
                ? {
                    $dayOfMonth: {
                      date: "$createdAt",
                      timezone: "Asia/Ho_Chi_Minh",
                    },
                  } // 1–31
                : {
                    $month: {
                      date: "$createdAt",
                      timezone: "Asia/Ho_Chi_Minh",
                    },
                  }, // 1–12
          sold: { $sum: "$lineItems.quantity" },
        },
      },
      {
        $project: {
          name: { $subtract: ["$_id", 1] }, // convert to 0-based index
          sold: 1,
          _id: 0,
        },
      },
      { $sort: { name: 1 } },
    ]);

    // Merge with all possible timeSlots
    const mergedData = timeSlots.map((slot) => {
      const found = productsSold.find((p) => p.name === slot);
      return {
        name: slot, // index base 0
        sold: found ? found.sold : 0,
      };
    });

    res.status(200).json({
      status: "success",
      data: mergedData,
    });
  }
);

export const getStockSummary = catchAsync(
  async (req: Request, res: Response) => {
    const products = await Product.find();

    let inStock = 0;
    let outStock = 0;

    // Tính toán tổng số lượng
    products.forEach((product) => {
      const totalStock = product.totalStock; // Dùng virtual field để lấy tổng stock
      if (totalStock > 0) {
        inStock++;
      } else {
        outStock++; // Nếu không còn hàng, tăng biến đếm outStock
      }
    });

    res.status(200).json({
      status: "success",
      data: {
        inStock: inStock,
        outStock: outStock,
      },
    });
  }
);

export const getProductsSummary = catchAsync(
  async (req: Request, res: Response) => {
    // Tính toán số lượng sản phẩm
    const totalProducts = await Product.countDocuments({}); // Tổng số sản phẩm
    const products = await Product.find({}); // Lấy toàn bộ sản phẩm để tính stock

    // Tính toán totalInStock và totalOutStock
    let totalInStock = 0;
    let totalOutStock = 0;

    products.forEach((product) => {
      const totalStock = product.totalStock; // Dùng virtual field
      if (totalStock > 0) {
        totalInStock += totalStock; // Cộng tổng số lượng sản phẩm còn hàng
      } else {
        totalOutStock += 1; // Nếu không còn hàng, cộng vào outStock
      }
    });

    const prediction = await predictOutOfStock();

    // Trả về kết quả
    return res.status(200).json({
      totalStock: totalProducts,
      totalOutStock: totalOutStock,
      totalInStock: totalInStock,
      prediction: prediction,
    });
  }
);

export const getCategorySaleData = async (
  category: any,
  startDate: Date,
  endDate: Date,
  groupBy: any
) => {
  const sales = await Order.aggregate([
    {
      $match: {
        status: { $nin: ["unpaid", "cancelled"] },
        createdAt: { $gte: startDate, $lt: endDate },
      },
    },
    { $unwind: "$lineItems" },
    {
      $lookup: {
        from: "products",
        localField: "lineItems.product",
        foreignField: "_id",
        as: "product",
      },
    },
    { $unwind: "$product" },
    {
      $match: { "product.category": category._id },
    },
    {
      $group: {
        _id: groupBy,
        value: { $sum: "$lineItems.subtotal" },
      },
    },
    {
      $project: {
        _id: 0,
        name: "$_id",
        value: 1,
      },
    },
    { $sort: { name: 1 } },
  ]);
  return sales;
};

export const getCategorySales = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const range = req.query.range as string;

    // Only validate the range parameter
    if (!range || !["day", "month", "year"].includes(range)) {
      return res.status(400).json({
        status: "fail",
        message:
          'Invalid or missing "range" parameter. Must be one of: day, month, year',
      });
    }

    // Always use current date if not specified
    const now = new Date();
    const year =
      req.query.year && !isNaN(parseInt(req.query.year as string))
        ? parseInt(req.query.year as string)
        : now.getFullYear();
    const month =
      req.query.month && !isNaN(parseInt(req.query.month as string))
        ? parseInt(req.query.month as string)
        : now.getMonth() + 1; // 1-based month

    const { startDate, endDate } = getTime(range, year, month);
    const sales = await Order.aggregate([
      {
        $match: {
          status: { $nin: ["unpaid", "cancelled"] },
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $unwind: "$lineItems" },
      {
        $lookup: {
          from: "products", // the collection name for products
          localField: "lineItems.product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category", // group by product's category
          totalSales: { $sum: "$lineItems.subtotal" },
        },
      },
      {
        $lookup: {
          from: "categories", // the collection name for categories
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      {
        $project: {
          _id: 0,
          name: "$category.name", // category name
          value: "$totalSales",
        },
      },
      { $sort: { name: 1 } },
    ]);

    // Send the response with an array of { name, value } objects.
    res.status(200).json({
      status: "success",
      data: {
        sales,
      },
    });
  }
);

export const getTopProvinces = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const range = req.query.range as string;

    // Only validate the range parameter
    if (!range || !["month", "year"].includes(range)) {
      return res.status(400).json({
        status: "fail",
        message:
          'Invalid or missing "range" parameter. Must be one of: month, year',
      });
    }

    // Always use current date if not specified
    const now = new Date();
    const year =
      req.query.year && !isNaN(parseInt(req.query.year as string))
        ? parseInt(req.query.year as string)
        : now.getFullYear();
    const month =
      req.query.month && !isNaN(parseInt(req.query.month as string))
        ? parseInt(req.query.month as string)
        : now.getMonth() + 1; // 1-based month

    const { startDate, endDate } = getTime(range, year, month);

    const topProvinces = await Order.getTopProvinces(startDate, endDate, 5);

    res.status(200).json({
      status: "success",
      data: topProvinces,
    });
  }
);

export const getOrderStatusCounts = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const range = req.query.range as string;

    // Only validate the range parameter
    if (!range || !["month", "year"].includes(range)) {
      return res.status(400).json({
        status: "fail",
        message:
          'Invalid or missing "range" parameter. Must be one of: month, year',
      });
    }

    // Always use current date if not specified
    const now = new Date();
    const year =
      req.query.year && !isNaN(parseInt(req.query.year as string))
        ? parseInt(req.query.year as string)
        : now.getFullYear();
    const month =
      req.query.month && !isNaN(parseInt(req.query.month as string))
        ? parseInt(req.query.month as string)
        : now.getMonth() + 1; // 1-based month

    const { startDate, endDate } = getTime(range, year, month);

    const statusCounts = await Order.getOrderStatusCounts(startDate, endDate);

    res.status(200).json({
      status: "success",
      data: statusCounts,
    });
  }
);

const getOrderStatsByStatus = async (startDate: Date, endDate: Date) => {
  return Order.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);
};

export const getOrderStats = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Current month calculations
    const thisMonthStartDate = new Date(
      `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`
    );
    const thisMonthEndDate = new Date(
      `${currentYear}-${String(currentMonth).padStart(2, "0")}-${new Date(currentYear, currentMonth, 0).getDate()}`
    );

    // Previous month calculations
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    const previousMonthStartDate = new Date(
      `${previousYear}-${String(previousMonth).padStart(2, "0")}-01`
    );
    const previousMonthEndDate = new Date(
      `${previousYear}-${String(previousMonth).padStart(2, "0")}-${new Date(previousYear, previousMonth, 0).getDate()}`
    );

    // Get total orders for all time
    const totalStats = await getOrderStatsByStatus(new Date(0), now);
    const totalMap = new Map(totalStats.map((stat) => [stat._id, stat.count]));

    // Get current month stats for changeRate
    const currentMonthStats = await getOrderStatsByStatus(
      thisMonthStartDate,
      thisMonthEndDate
    );
    const currentMonthMap = new Map(
      currentMonthStats.map((stat) => [stat._id, stat.count])
    );

    // Get previous month stats for changeRate
    const previousMonthStats = await getOrderStatsByStatus(
      previousMonthStartDate,
      previousMonthEndDate
    );
    const previousMonthMap = new Map(
      previousMonthStats.map((stat) => [stat._id, stat.count])
    );

    // Calculate total orders and change rate
    const totalOrders = {
      value: Array.from(totalMap.values()).reduce(
        (sum, count) => sum + count,
        0
      ),
      changeRate: calculateChangeRate(
        Array.from(currentMonthMap.values()).reduce(
          (sum, count) => sum + count,
          0
        ),
        Array.from(previousMonthMap.values()).reduce(
          (sum, count) => sum + count,
          0
        )
      ),
    };

    // Calculate stats for each status
    const stats = {
      totalOrders,
      totalPendingOrders: {
        value: totalMap.get("pending") || 0,
        changeRate: calculateChangeRate(
          currentMonthMap.get("pending") || 0,
          previousMonthMap.get("pending") || 0
        ),
      },
      totalShippedOrders: {
        value: totalMap.get("shipped") || 0,
        changeRate: calculateChangeRate(
          currentMonthMap.get("shipped") || 0,
          previousMonthMap.get("shipped") || 0
        ),
      },
      totalDeliveredOrders: {
        value: totalMap.get("delivered") || 0,
        changeRate: calculateChangeRate(
          currentMonthMap.get("delivered") || 0,
          previousMonthMap.get("delivered") || 0
        ),
      },
      totalCancelOrders: {
        value: totalMap.get("cancelled") || 0,
        changeRate: calculateChangeRate(
          currentMonthMap.get("cancelled") || 0,
          previousMonthMap.get("cancelled") || 0
        ),
      },
    };

    res.status(200).json({
      status: "success",
      data: stats,
    });
  }
);

export const getUserStats = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const thisMonthStartDate = new Date(
      `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`
    );
    const thisMonthEndDate = new Date(currentYear, currentMonth, 0); // cuối tháng hiện tại

    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    const previousMonthStartDate = new Date(
      `${previousYear}-${String(previousMonth).padStart(2, "0")}-01`
    );
    const previousMonthEndDate = new Date(previousYear, previousMonth, 0); // cuối tháng trước

    const countUsers = async (filter = {}) => await User.countDocuments(filter);

    const countUsersBetween = async (filter = {}, start: Date, end: Date) =>
      await User.countDocuments({
        ...filter,
        createdAt: { $gte: start, $lte: end },
      });

    // Tổng số user từ trước tới nay
    const totalUsers = await countUsers();
    const totalActiveUsers = await countUsers({ isActive: true });
    const totalVerifiedUsers = await countUsers({ isEmailVerified: true });
    const totalAdminUsers = await countUsers({ role: "admin" });

    // Tháng hiện tại
    const currentMonthUsers = await countUsersBetween(
      {},
      thisMonthStartDate,
      thisMonthEndDate
    );
    const currentActiveUsers = await countUsersBetween(
      { isActive: true },
      thisMonthStartDate,
      thisMonthEndDate
    );
    const currentVerifiedUsers = await countUsersBetween(
      { isEmailVerified: true },
      thisMonthStartDate,
      thisMonthEndDate
    );
    const currentAdminUsers = await countUsersBetween(
      { role: "admin" },
      thisMonthStartDate,
      thisMonthEndDate
    );

    // Tháng trước
    const prevMonthUsers = await countUsersBetween(
      {},
      previousMonthStartDate,
      previousMonthEndDate
    );
    const prevActiveUsers = await countUsersBetween(
      { isActive: true },
      previousMonthStartDate,
      previousMonthEndDate
    );
    const prevVerifiedUsers = await countUsersBetween(
      { isEmailVerified: true },
      previousMonthStartDate,
      previousMonthEndDate
    );
    const prevAdminUsers = await countUsersBetween(
      { role: "admin" },
      previousMonthStartDate,
      previousMonthEndDate
    );

    const calculateChangeRate = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const stats = {
      totalUsers: {
        value: totalUsers,
        changeRate: calculateChangeRate(currentMonthUsers, prevMonthUsers),
      },
      totalActiveUsers: {
        value: totalActiveUsers,
        changeRate: calculateChangeRate(currentActiveUsers, prevActiveUsers),
      },
      totalVerifiedUsers: {
        value: totalVerifiedUsers,
        changeRate: calculateChangeRate(
          currentVerifiedUsers,
          prevVerifiedUsers
        ),
      },
      totalAdminUsers: {
        value: totalAdminUsers,
        changeRate: calculateChangeRate(currentAdminUsers, prevAdminUsers),
      },
    };

    res.status(200).json({
      status: "success",
      data: stats,
    });
  }
);

export const getTopProvincesWithMostPurchasingUsers = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const range = req.query.range as string;

    // Only validate the range parameter
    if (!range || !["month", "year"].includes(range)) {
      return res.status(400).json({
        status: "fail",
        message:
          'Invalid or missing "range" parameter. Must be one of: month, year',
      });
    }

    // Always use current date if not specified
    const now = new Date();
    const year =
      req.query.year && !isNaN(parseInt(req.query.year as string))
        ? parseInt(req.query.year as string)
        : now.getFullYear();
    const month =
      req.query.month && !isNaN(parseInt(req.query.month as string))
        ? parseInt(req.query.month as string)
        : now.getMonth() + 1; // 1-based month

    const { startDate, endDate } = getTime(range, year, month);

    // Gộp đơn hàng delivered theo tỉnh
    const topProvinces = await Order.getTopProvincesByPurchasingUsers(
      startDate,
      endDate,
      6
    );

    res.status(200).json({
      status: "success",
      data: topProvinces,
    });
  }
);
