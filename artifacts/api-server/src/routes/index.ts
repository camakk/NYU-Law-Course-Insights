import { Router, type IRouter } from "express";
import healthRouter from "./health";
import examFeedbackRouter from "./exam-feedback";

const router: IRouter = Router();

router.use(healthRouter);
router.use(examFeedbackRouter);

export default router;
