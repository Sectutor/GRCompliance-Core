import { Router } from "express";
import { handleUpload } from "../uploadAccess";

export const uploadRouter = Router();

uploadRouter.post("/", (req, res) => {
    void handleUpload(req, res);
});
