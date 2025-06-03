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
    origin: "http://localhost:3000",
    methods: "GET,POST,PUT,DELETE,PATCH",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true,
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

app.use(express.json({ limit: "10kb" }));
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

app.use(errorController);

export default app;
