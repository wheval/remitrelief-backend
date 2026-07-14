import "dotenv/config";
import express from "express";
import cors from "cors";
import campaignsRouter from "./routes/campaigns.js";
import milestonesRouter from "./routes/milestones.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/campaigns", campaignsRouter);
app.use("/milestones", milestonesRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`RemitRelief API listening on :${PORT}`));
