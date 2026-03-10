import { Request, Response, NextFunction } from "express";
import { IdentifyRequest } from "../types";

export function validateIdentifyRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const body = req.body as IdentifyRequest;

  const hasEmail =
    body.email !== undefined &&
    body.email !== null &&
    body.email.trim() !== "";

  const hasPhone =
    body.phoneNumber !== undefined &&
    body.phoneNumber !== null &&
    String(body.phoneNumber).trim() !== "";

  if (!hasEmail && !hasPhone) {
    res.status(400).json({
      error: "Bad Request",
      message: "At least one of 'email' or 'phoneNumber' must be provided.",
    });
    return;
  }

  next();
}