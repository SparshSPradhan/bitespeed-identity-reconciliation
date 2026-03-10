import { Router } from "express";
import { identify } from "../controllers/identifyController";
import { validateIdentifyRequest } from "../middleware/validateRequest";

const router = Router();

router.post("/identify", validateIdentifyRequest, identify);

export default router;