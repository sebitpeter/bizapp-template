import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import oauthRouter from "./oauth";
import usersRouter from "./users";
import settingsRouter from "./settings";
import productsRouter from "./products";
import ordersRouter from "./orders";
import paymentsRouter from "./payments";
import contentRouter from "./content";
import reviewsRouter from "./reviews";
import newsletterRouter from "./newsletter";
import dashboardRouter from "./dashboard";
import mediaRouter from "./media";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(oauthRouter);
router.use(usersRouter);
router.use(settingsRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(paymentsRouter);
router.use(contentRouter);
router.use(reviewsRouter);
router.use(newsletterRouter);
router.use(dashboardRouter);
router.use(mediaRouter);

export default router;
