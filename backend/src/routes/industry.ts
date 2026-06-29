import { Router } from "express";
import { z } from "zod";
import { asyncHandler, parseQuery } from "./routeHelpers.js";
import {
  getIndustryCategories,
  listIndustries,
  searchIndustries
} from "../services/industry.js";

export const industryRouter = Router();

const categoriesQuerySchema = z.object({
  industry: z.string().trim().min(1).max(100)
});

const searchQuerySchema = z.object({
  q: z.string().trim().max(100).default("")
});

industryRouter.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const query = parseQuery(categoriesQuerySchema, req);
    res.json({
      success: true,
      data: {
        industry: query.industry,
        categories: getIndustryCategories(query.industry)
      }
    });
  })
);

industryRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const query = parseQuery(searchQuerySchema, req);
    res.json({
      success: true,
      data: {
        industries: searchIndustries(query.q)
      }
    });
  })
);

industryRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({
      success: true,
      data: {
        industries: listIndustries()
      }
    });
  })
);
