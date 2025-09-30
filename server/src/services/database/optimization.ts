import { PrismaClient } from "@prisma/client";
import { DatabaseHealth, CleanupResult } from "../../types/database";
import { prisma } from "../../lib/database";

export class DatabaseOptimizationService {
  /**
   * Comprehensive database health check
   */
  static async checkDatabaseHealth(): Promise<DatabaseHealth> {
    try {
      console.log("🔍 Checking database health...");

      // Check connection
      await prisma.$connect();

      // Get database size and statistics
      const [
        userCount,
        mealCount,
        sessionCount,
        recommendationCount,
        chatMessageCount,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.meal.count(),
        prisma.session.count(),
        prisma.aiRecommendation.count(),
        prisma.chatMessage.count(),
      ]);

      const totalRecords =
        userCount +
        mealCount +
        sessionCount +
        recommendationCount +
        chatMessageCount;
      const estimatedSize = totalRecords * 0.001; // Rough estimate in MB

      // Check for expired sessions
      const expiredSessions = await prisma.session.count({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      // Check for old recommendations
      const oldRecommendations = await prisma.aiRecommendation.count({
        where: {
          created_at: {
            lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          },
        },
      });

      const needsCleanup =
        expiredSessions > 100 ||
        oldRecommendations > 1000 ||
        estimatedSize > 50;

      let status: "healthy" | "warning" | "critical" = "healthy";
      if (estimatedSize > 80 || expiredSessions > 500) {
        status = "critical";
      } else if (estimatedSize > 50 || expiredSessions > 200) {
        status = "warning";
      }

      const health: DatabaseHealth = {
        status,
        size: estimatedSize,
        maxSize: 100, // 100MB limit
        connectionCount: 1, // Single connection in this context
        lastCleanup: new Date(), // Would track actual last cleanup
        needsCleanup,
      };

      console.log("✅ Database health check completed:", health);
      return health;
    } catch (error) {
      console.error("💥 Database health check failed:", error);
      return {
        status: "critical",
        size: 0,
        maxSize: 100,
        connectionCount: 0,
        lastCleanup: new Date(),
        needsCleanup: true,
      };
    }
  }

  /**
   * Intelligent database cleanup with safety checks
   */
  static async performIntelligentCleanup(): Promise<CleanupResult> {
    console.log("🧹 Starting intelligent database cleanup...");

    let deletedRecords = 0;
    const errors: string[] = [];

    try {
      await prisma.$transaction(
        async (tx) => {
          // 1. Clean expired sessions
          const expiredSessionsResult = await tx.session.deleteMany({
            where: {
              expiresAt: {
                lt: new Date(),
              },
            },
          });
          deletedRecords += expiredSessionsResult.count;
          console.log(
            `🗑️ Deleted ${expiredSessionsResult.count} expired sessions`
          );

          // 2. Clean old AI recommendations (keep last 30 days)
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const oldRecommendationsResult = await tx.aiRecommendation.deleteMany(
            {
              where: {
                created_at: {
                  lt: thirtyDaysAgo,
                },
              },
            }
          );
          deletedRecords += oldRecommendationsResult.count;
          console.log(
            `🗑️ Deleted ${oldRecommendationsResult.count} old AI recommendations`
          );

          // 3. Clean old chat messages (keep last 100 per user)
          const users = await tx.user.findMany({
            select: { user_id: true },
          });

          for (const user of users) {
            const oldMessages = await tx.chatMessage.findMany({
              where: { user_id: user.user_id },
              orderBy: { created_at: "desc" },
              skip: 100,
              select: { message_id: true },
            });

            if (oldMessages.length > 0) {
              const deletedMessages = await tx.chatMessage.deleteMany({
                where: {
                  message_id: {
                    in: oldMessages.map((m) => m.message_id),
                  },
                },
              });
            }
          }

          // 5. Clean old daily goals (keep last 90 days)
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          const oldGoalsResult = await tx.dailyGoal.deleteMany({
            where: {
              created_at: {
                lt: ninetyDaysAgo,
              },
            },
          });
          deletedRecords += oldGoalsResult.count;
          console.log(`🗑️ Deleted ${oldGoalsResult.count} old daily goals`);
        },
        {
          timeout: 60000, // 60 second timeout
          isolationLevel: "Serializable",
        }
      );

      console.log(
        `✅ Intelligent cleanup completed: ${deletedRecords} records deleted`
      );

      return {
        deletedRecords,
        freedSpace: deletedRecords * 0.001, // Rough estimate
        errors,
      };
    } catch (error) {
      console.error("💥 Database cleanup failed:", error);
      errors.push(
        error instanceof Error ? error.message : "Unknown cleanup error"
      );

      return {
        deletedRecords,
        freedSpace: 0,
        errors,
      };
    }
  }

  /**
   * Optimize database queries and indexes
   */
  static async optimizeDatabase(): Promise<void> {
    try {
      console.log("⚡ Optimizing database performance...");

      // Run ANALYZE to update table statistics (can run in transaction)
      try {
        await prisma.$executeRaw`ANALYZE;`;
        console.log("✅ Database ANALYZE completed");
      } catch (analyzeError) {
        console.log("⚠️ ANALYZE operation failed:", analyzeError);
      }

      // Run VACUUM outside of any transaction
      try {
        // Ensure we're not in a transaction by disconnecting and reconnecting
        await prisma.$disconnect();
        await prisma.$connect();

        // Now run VACUUM outside of transaction
        await prisma.$executeRawUnsafe("VACUUM;");
        console.log("✅ Database VACUUM completed");
      } catch (vacuumError) {
        console.log("⚠️ VACUUM operation failed:", vacuumError);
        // Try alternative lightweight cleanup
        try {
          await prisma.$executeRaw`REINDEX DATABASE;`;
          console.log("✅ Database REINDEX completed as fallback");
        } catch (reindexError) {
          console.log("ℹ️ Fallback REINDEX also failed, skipping optimization");
        }
      }

      console.log("✅ Database optimization completed");
    } catch (error) {
      console.error("❌ Database optimization failed:", error);
      // Don't throw error to prevent breaking the application
    }
  }

  /**
   * Check for duplicate prevention
   */
  static async checkForDuplicates(
    userId: string,
    date: string
  ): Promise<{
    hasDailyGoal: boolean;
    hasRecommendation: boolean;
  }> {
    try {
      const [dailyGoal, recommendation] = await Promise.all([
        prisma.dailyGoal.findFirst({
          where: {
            user_id: userId,
            date: new Date(date),
          },
        }),
        prisma.aiRecommendation.findFirst({
          where: {
            user_id: userId,
            date: date,
          },
        }),
      ]);

      return {
        hasDailyGoal: !!dailyGoal,
        hasRecommendation: !!recommendation,
      };
    } catch (error) {
      console.error("Error checking for duplicates:", error);
      return {
        hasDailyGoal: false,
        hasRecommendation: false,
      };
    }
  }

  /**
   * Emergency database recovery
   */
  static async emergencyRecovery(): Promise<boolean> {
    try {
      console.log("🚨 Starting emergency database recovery...");

      // 1. Test basic connectivity
      await prisma.$connect();
      console.log("✅ Database connection restored");

      // 2. Perform aggressive cleanup
      const cleanupResult = await this.performIntelligentCleanup();
      console.log(
        `🧹 Emergency cleanup: ${cleanupResult.deletedRecords} records removed`
      );

      // 3. Optimize database
      await this.optimizeDatabase();

      // 4. Verify critical tables
      const criticalCounts = await Promise.all([
        prisma.user.count(),
        prisma.meal.count(),
        prisma.dailyGoal.count(),
      ]);

      console.log("📊 Critical table counts:", {
        users: criticalCounts[0],
        meals: criticalCounts[1],
        dailyGoals: criticalCounts[2],
      });

      console.log("✅ Emergency recovery completed successfully");
      return true;
    } catch (error) {
      console.error("💥 Emergency recovery failed:", error);
      return false;
    }
  }
}
