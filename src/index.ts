import express, { Application, Request, Response } from "express";
import dotenv from "dotenv";
import identifyRouter from "./routes/identify";

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", message: "Server is running" });
});

app.use("/", identifyRouter);

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📌 POST http://localhost:${PORT}/identify`);
});

export default app;