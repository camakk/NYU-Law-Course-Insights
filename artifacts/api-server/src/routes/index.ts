import { Router, type IRouter } from "express";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
// After the exam is temporarily disabled. Do not mount its router:
// this blocks reads, submissions, and reports without deleting saved feedback.

export default router;
