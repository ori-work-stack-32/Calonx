import { Router, Response } from "express";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { FoodScannerService } from "../services/foodScanner";
import { UsageTrackingService } from "../services/usageTracking";
import { z } from "zod";

const router = Router();

// Validation schemas
const barcodeSchema = z.object({
  barcode: z.string().min(8, "Barcode must be at least 8 characters"),
});

const imageSchema = z
  .object({
    image: z.string().min(100, "Image data is required").optional(),
    imageBase64: z.string().min(100, "Image data is required").optional(),
  })
  .refine((data) => data.image || data.imageBase64, {
    message: "Either image or imageBase64 is required",
  });

const addToMealSchema = z.object({
  productData: z.object({
    name: z.string(),
    brand: z.string().optional(),
    category: z.string(),
    nutrition_per_100g: z.object({
      calories: z.number(),
      protein: z.number(),
      carbs: z.number(),
      fat: z.number(),
      fiber: z.number().optional(),
      sugar: z.number().optional(),
      sodium: z.number().optional(),
    }),
    ingredients: z.array(z.string()),
    allergens: z.array(z.string()),
    labels: z.array(z.string()),
    health_score: z.number().optional(),
    barcode: z.string().optional(),
  }),
  quantity: z.number().min(1, "Quantity must be at least 1 gram"),
  mealTiming: z.string().optional().default("SNACK"),
});

// Scan barcode endpoint
router.post(
  "/barcode",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.user_id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
      }

      console.log("🔍 Barcode scan request received");
      const validationResult = barcodeSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid barcode",
          details: validationResult.error.errors,
        });
      }

      const { barcode } = validationResult.data;

      const result = await FoodScannerService.scanBarcode(barcode, userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error("❌ Barcode scan error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to scan barcode",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Scan image endpoint
router.post(
  "/image",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.user_id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
      }

      const limitCheck = await UsageTrackingService.checkMealScanLimit(userId);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          success: false,
          error: limitCheck.message,
          usage: {
            current: limitCheck.current,
            limit: limitCheck.limit,
            remaining: limitCheck.remaining,
          },
        });
      }

      console.log("📷 Image scan request received");
      const validationResult = imageSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid image data",
          details: validationResult.error.errors,
        });
      }

      const { image, imageBase64 } = validationResult.data;
      const imageData = image || imageBase64 || "";

      const result = await FoodScannerService.scanProductImage(
        imageData,
        userId
      );

      await UsageTrackingService.incrementMealScanCount(userId);

      res.json({
        success: true,
        data: result,
        usage: {
          current: limitCheck.current + 1,
          limit: limitCheck.limit,
          remaining: limitCheck.remaining - 1,
        },
      });
    } catch (error) {
      console.error("❌ Image scan error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to scan image",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Add product to meal log endpoint
router.post(
  "/add-to-meal",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.user_id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
      }

      console.log("📝 Add to meal log request received");
      const validationResult = addToMealSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid meal data",
          details: validationResult.error.errors,
        });
      }

      const { productData, quantity, mealTiming } = validationResult.data;

      const meal = await FoodScannerService.addProductToMealLog(
        userId,
        productData,
        quantity,
        mealTiming
      );

      res.json({
        success: true,
        data: meal,
      });
    } catch (error) {
      console.error("❌ Add to meal error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to add product to meal log",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// Get scan history
router.get(
  "/history",
  authenticateToken,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.user_id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
      }

      const products = await FoodScannerService.getScanHistory(userId);

      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      console.error("❌ Get scan history error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get scan history",
      });
    }
  }
);

export default router;
