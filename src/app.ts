import express, { Application } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import xss from "xss-clean";
import hpp from "hpp";
import mongoSanitize from "express-mongo-sanitize";
import compression from "compression";
import productRouter from "./routes/productRoute";
import userRouter from "./routes/userRoute";
import categoryRouter from "./routes/categoryRoute";
import addressRouter from "./routes/addressRoute";
import discountRouter from "./routes/discountRoute";
import reviewRouter from "./routes/reviewRoute";
import cartRouter from "./routes/cartRoute";
import orderRouter from "./routes/orderRoute";
import paymentRouter from "./routes/paymentRoute";
import wishlistRouter from "./routes/wishlistRoute";
import chatbotRouter from "./routes/chatbotRoute";
import notificationRouter from "./routes/notificationRoute";
import errorController from "./controllers/errorController";
import webhookRouter from "./routes/webhookRoute";
import adminRouter from "./routes/adminRoute";
import apiCallback from "./routes/apiCallbackRoute";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app: Application = express();

app.use(helmet());
app.use(compression());

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        "https://ryxel-store-mu.vercel.app",
        "http://localhost:3000",
        "https://localhost:3000",
      ];

      // Check exact matches first
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Check patterns for Vercel deployment URLs
      if (/^https:\/\/.*\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }

      // Check patterns for Cloudflare tunnel URLs
      if (/^https:\/\/.*\.trycloudflare\.com$/.test(origin)) {
        return callback(null, true);
      }

      // Log denied origins for debugging in development
      if (process.env.NODE_ENV === "development") {
        console.log(`CORS: Denied origin: ${origin}`);
      }

      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Headers",
      "Access-Control-Allow-Methods",
      "ngrok-skip-browser-warning",
      "cf-connecting-ip",
      "cf-ray",
      "cf-ipcountry",
      "x-forwarded-for",
      "x-forwarded-proto",
      "x-real-ip",
    ],
    credentials: true,
    optionsSuccessStatus: 200,
    preflightContinue: false,
  })
);

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}
if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined"));
}

const limiter = rateLimit({
  max: process.env.NODE_ENV === "development" ? 99999999 : 100,
  windowMs: 60 * 60 * 1000,
  message: "Too many requests from this IP, please try again in an hour!",
});

app.use("/api", limiter);

app.use("/api/v1/webhooks", webhookRouter);

app.use(express.json({ limit: "10mb" }));
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(mongoSanitize());
app.use(xss());
app.use(hpp({ whitelist: [] }));

app.use("/api/v1/products", productRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/categories", categoryRouter);
app.use("/api/v1/addresses", addressRouter);
app.use("/api/v1/discounts", discountRouter);
app.use("/api/v1/reviews", reviewRouter);
app.use("/api/v1/cart", cartRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/payments", paymentRouter);
app.use("/api/v1/wishlist", wishlistRouter);
app.use("/api/v1/notifications", notificationRouter);
app.use("/api/v1/api-callback", apiCallback);
app.use("/api/v1/chatbot", chatbotRouter);
app.use("/api/v1/admin", adminRouter);

// CORS testing endpoint
app.get("/api/v1/cors-test", (req, res) => {
  res.json({
    message: "CORS is working correctly",
    origin: req.get("Origin") || "No origin header",
    headers: req.headers,
    timestamp: new Date().toISOString(),
  });
});

app.use(errorController);

export default app;
