import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Image,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTheme } from "@/src/context/ThemeContext";
import { LinearGradient } from "expo-linear-gradient";
import {
  Camera,
  Target,
  TrendingUp,
  ShoppingCart,
  Trophy,
  Flame,
  Star,
  ChevronRight,
  Sun,
  Coffee,
} from "lucide-react-native";
import { api, APIError } from "@/src/services/api";
import { fetchMeals } from "@/src/store/mealSlice";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/src/i18n/context/LanguageContext";
import LoadingScreen from "@/components/LoadingScreen";
import ErrorBoundary from "@/components/ErrorBoundary";
import XPNotification from "@/components/XPNotification";
import { setUser } from "@/src/store/authSlice";
import { useOptimizedSelector } from "@/src/utils/useOptimizedSelector";
import { useDispatch } from "react-redux";
import { AppDispatch, RootState } from "@/src/store";
import CircularCaloriesProgress from "@/components/index/CircularCaloriesProgress";
import ShoppingList from "@/components/ShoppingList";
import { initializeStorageCleanup } from "@/src/utils/databaseCleanup";
import WaterIntakeCard from "@/components/index/WaterIntake";

const { width } = Dimensions.get("window");

interface DailyGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
}

const HomeScreen = React.memo(() => {
  const dispatch = useDispatch<AppDispatch>();

  const selectMealState = useMemo(
    () => (state: RootState) => ({
      meals: state.meal.meals,
      isLoading: state.meal.isLoading,
    }),
    []
  );

  const selectAuthState = useMemo(
    () => (state: RootState) => ({
      user: state.auth.user,
    }),
    []
  );

  const { meals, isLoading } = useOptimizedSelector(selectMealState);
  const { user } = useOptimizedSelector(selectAuthState);
  const { colors, isDark } = useTheme();

  const [dailyGoals, setDailyGoals] = useState<DailyGoals>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    targetCalories: 2205,
    targetProtein: 120,
    targetCarbs: 200,
    targetFat: 60,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [waterCups, setWaterCups] = useState(0);
  const [language, setLanguage] = useState<"he" | "en">("he");
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isUpdating, setIsUpdating] = useState(false);

  const [showXPNotification, setShowXPNotification] = useState(false);
  const [xpNotificationData, setXPNotificationData] = useState<{
    xpGained: number;
    leveledUp?: boolean;
    newLevel?: number;
    newAchievements?: any[];
  }>({ xpGained: 0 });

  const [showShoppingList, setShowShoppingList] = useState(false);

  const handleOpenShoppingList = useCallback(() => {
    setShowShoppingList(true);
  }, []);

  const handleCloseShoppingList = useCallback(() => {
    setShowShoppingList(false);
  }, []);

  const { t = (key: string) => key } = {};
  const { isRTL } = useLanguage();

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  };

  const isLoadingRef = useRef(false);
  const lastDataLoadRef = useRef<number>(0);
  const waterSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const processedMealsData = useMemo(() => {
    if (!meals || meals.length === 0) {
      return {
        recentMeals: [],
        todaysMeals: [],
        dailyTotals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      };
    }

    const sortedMeals = [...meals].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const today = new Date().toISOString().split("T")[0];
    const todayMeals = meals.filter((meal: { created_at: string }) =>
      meal.created_at.startsWith(today)
    );

    const dailyTotals = todayMeals.reduce(
      (
        acc: { calories: any; protein: any; carbs: any; fat: any },
        meal: { calories: any; protein: any; carbs: any; fat: any }
      ) => ({
        calories: acc.calories + (meal.calories || 0),
        protein: acc.protein + (meal.protein || 0),
        carbs: acc.carbs + (meal.carbs || 0),
        fat: acc.fat + (meal.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    return {
      recentMeals: sortedMeals.slice(0, 4),
      todaysMeals: todayMeals,
      dailyTotals,
    };
  }, [meals]);

  const updateDailyGoals = useCallback(() => {
    setDailyGoals((prev) => ({
      ...prev,
      ...processedMealsData.dailyTotals,
    }));
  }, [processedMealsData.dailyTotals]);

  const loadDailyGoals = useCallback(async () => {
    if (!user?.user_id) return;

    try {
      const { dailyGoalsAPI } = await import("@/src/services/api");
      const goalsResponse = await dailyGoalsAPI.getDailyGoals();

      if (goalsResponse.success && goalsResponse.data) {
        setDailyGoals((prev) => ({
          ...prev,
          targetCalories: goalsResponse.data.calories || 2205,
          targetProtein: goalsResponse.data.protein_g || 120,
          targetCarbs: goalsResponse.data.carbs_g || 200,
          targetFat: goalsResponse.data.fats_g || 60,
        }));
      } else {
        const createResponse = await dailyGoalsAPI.createDailyGoals();
        if (createResponse.success && createResponse.data) {
          setDailyGoals((prev) => ({
            ...prev,
            targetCalories: createResponse.data.calories || 2205,
            targetProtein: createResponse.data.protein_g || 120,
            targetCarbs: createResponse.data.carbs_g || 200,
            targetFat: createResponse.data.fats_g || 60,
          }));
        }
      }
    } catch (error) {
      console.error("Error loading daily goals:", error);
      setDailyGoals((prev) => ({
        ...prev,
        targetCalories: 2205,
        targetProtein: 120,
        targetCarbs: 200,
        targetFat: 60,
      }));
    }
  }, [user?.user_id]);

  const loadWaterIntake = useCallback(async () => {
    if (!user?.user_id) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const today = new Date().toISOString().split("T")[0];
      const response = await api.get(`/nutrition/water-intake/${today}`, {
        signal: controller.signal,
      });
      if (response.data.success) {
        const serverCups = response.data.data.cups_consumed || 0;
        setWaterCups(serverCups);
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("Error loading water intake:", error);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, [user?.user_id]);

  const syncWaterWithServer = useCallback(
    async (totalCups: number) => {
      if (!user?.user_id) return;

      try {
        const today = new Date().toISOString().split("T")[0];
        const response = await api.post("/nutrition/water-intake", {
          cups_consumed: totalCups,
          date: today,
        });

        if (response.data.success) {
          if (
            response.data.xpAwarded > 0 ||
            response.data.newAchievements?.length > 0
          ) {
            setXPNotificationData({
              xpGained: response.data.xpAwarded || 0,
              leveledUp: response.data.leveledUp,
              newLevel: response.data.newLevel,
              newAchievements: response.data.newAchievements || [],
            });
            setShowXPNotification(true);
          }
        }
      } catch (error: any) {
        console.error("Error syncing water intake:", error);
      }
    },
    [user?.user_id]
  );

  const incrementWater = useCallback(() => {
    const goalMaxCups = 10;
    if (waterCups >= goalMaxCups) return;

    const newTotal = waterCups + 1;
    setWaterCups(newTotal);

    if (waterSyncTimeoutRef.current) {
      clearTimeout(waterSyncTimeoutRef.current);
    }

    waterSyncTimeoutRef.current = setTimeout(() => {
      syncWaterWithServer(newTotal);
    }, 1000);
  }, [waterCups, syncWaterWithServer]);

  const decrementWater = useCallback(() => {
    if (waterCups <= 0) return;

    const newTotal = waterCups - 1;
    setWaterCups(newTotal);

    if (waterSyncTimeoutRef.current) {
      clearTimeout(waterSyncTimeoutRef.current);
    }

    waterSyncTimeoutRef.current = setTimeout(() => {
      syncWaterWithServer(newTotal);
    }, 1000);
  }, [waterCups, syncWaterWithServer]);

  const loadAllData = useCallback(
    async (force = false) => {
      if (!user?.user_id || isLoadingRef.current) return;

      const now = Date.now();
      const MIN_RELOAD_INTERVAL = 30 * 1000;

      if (!force && now - lastDataLoadRef.current < MIN_RELOAD_INTERVAL) {
        return;
      }

      isLoadingRef.current = true;
      setIsDataLoading(true);
      setDataError(null);

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Request timeout")), 15000)
        );

        const [mealsResult, goalsResult] = await Promise.allSettled([
          Promise.race([dispatch(fetchMeals()).unwrap(), timeoutPromise]),
          loadDailyGoals(),
        ]);

        if (mealsResult.status === "rejected") {
          console.error("Meals loading failed:", mealsResult.reason);
          setDataError("Failed to load meals data");
        }

        if (goalsResult.status === "rejected") {
          console.error("Goals loading failed:", goalsResult.reason);
        }

        setRetryCount(0);
      } catch (error) {
        console.error("Error loading data:", error);
        setDataError(
          error instanceof APIError ? error.message : "Failed to load data"
        );
        setRetryCount((prev) => prev + 1);
      } finally {
        setIsDataLoading(false);
        setInitialLoading(false);
        isLoadingRef.current = false;
        lastDataLoadRef.current = now;
      }
    },
    [user?.user_id, dispatch, retryCount, loadDailyGoals]
  );

  const onRefresh = useCallback(async () => {
    if (refreshing) return;

    setRefreshing(true);
    try {
      await loadAllData(true);
      await loadWaterIntake();
    } finally {
      setRefreshing(false);
    }
  }, [loadAllData, loadWaterIntake, refreshing]);

  const getTimeBasedGreeting = () => {
    const currentHour = new Date().getHours();

    if (currentHour >= 5 && currentHour < 12) {
      return {
        text: "Good Morning",
        icon: currentHour <= 7 ? Coffee : Sun,
        color: "#F59E0B",
        bgColor: "#FEF3C7",
      };
    } else if (currentHour >= 12 && currentHour < 17) {
      return {
        text: "Good Afternoon",
        icon: Sun,
        color: "#EAB308",
        bgColor: "#FEF9C3",
      };
    } else if (currentHour >= 17 && currentHour < 22) {
      return {
        text: "Good Evening",
        icon: Sun,
        color: "#F97316",
        bgColor: "#FED7AA",
      };
    } else {
      return {
        text: "Good Night",
        icon: Sun,
        color: "#6366F1",
        bgColor: "#E0E7FF",
      };
    }
  };

  const greeting = getTimeBasedGreeting();
  const IconComponent = greeting.icon;

  const getCurrentDate = () => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      month: "long",
      day: "numeric",
      year: "numeric",
    };
    return now.toLocaleDateString("en-US", options);
  };

  useEffect(() => {
    updateDailyGoals();
  }, [updateDailyGoals]);

  useEffect(() => {
    initializeStorageCleanup().catch((error) => {
      console.error("Failed to initialize storage cleanup:", error);
    });
  }, []);

  useEffect(() => {
    if (user?.user_id && initialLoading) {
      loadAllData(true);
      loadWaterIntake();
    }
  }, [user?.user_id, loadAllData, initialLoading, loadWaterIntake]);

  useEffect(() => {
    if (user?.user_id) {
      loadDailyGoals();
    }
  }, [user?.user_id, loadDailyGoals]);

  if (initialLoading) {
    return (
      <LoadingScreen text={isRTL ? "טוען מידע..." : "Loading your data..."} />
    );
  }

  if (dataError && retryCount > 0) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{dataError}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => loadAllData(true)}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        <XPNotification
          visible={showXPNotification}
          xpGained={xpNotificationData.xpGained}
          leveledUp={xpNotificationData.leveledUp}
          newLevel={xpNotificationData.newLevel}
          newAchievements={xpNotificationData.newAchievements}
          onHide={() => setShowXPNotification(false)}
          language={language}
        />

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#10B981"]}
              tintColor="#10B981"
            />
          }
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.profileContainer}>
                <Image
                  source={{
                    uri:
                      user?.avatar_url ||
                      "https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=1",
                  }}
                  style={styles.profileImage}
                />
                <View style={styles.onlineIndicator} />
              </View>
              <View style={styles.headerInfo}>
                <Text style={styles.dateText}>{getCurrentDate()}</Text>
              </View>
            </View>
          </View>

          <View style={styles.greetingCard}>
            <LinearGradient
              colors={["#10B981", "#059669"]}
              style={styles.greetingGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.greetingContent}>
                <View style={styles.greetingLeft}>
                  <View
                    style={[
                      styles.greetingIconContainer,
                      { backgroundColor: greeting.bgColor },
                    ]}
                  >
                    <IconComponent size={24} color={greeting.color} />
                  </View>
                  <View>
                    <Text style={styles.greetingText}>{greeting.text}</Text>
                    <Text style={styles.greetingName}>{user?.name}!</Text>
                  </View>
                </View>
                <View style={styles.greetingStats}>
                  <View style={styles.statBadge}>
                    <Star size={16} color="#FFD700" fill="#FFD700" />
                    <Text style={styles.statBadgeText}>
                      Level {user?.level || 1}
                    </Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.progressSection}>
            <CircularCaloriesProgress
              calories={dailyGoals.calories}
              targetCalories={dailyGoals.targetCalories}
              dailyGoals={dailyGoals}
              size={240}
            />
          </View>

          <WaterIntakeCard
            currentCups={waterCups}
            maxCups={10}
            onIncrement={incrementWater}
            onDecrement={decrementWater}
            disabled={isUpdating}
          />

          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>Your Progress</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <View
                    style={[styles.statIcon, { backgroundColor: "#FEF3C7" }]}
                  >
                    <Trophy size={20} color="#F59E0B" />
                  </View>
                  <Text style={styles.statCardTitle}>Total XP</Text>
                </View>
                <Text style={styles.statCardValue}>
                  {(user?.total_points || 0).toLocaleString()}
                </Text>
                <Text style={styles.statCardSubtext}>Keep it up!</Text>
              </View>

              <View style={styles.statCard}>
                <View style={styles.statCardHeader}>
                  <View
                    style={[styles.statIcon, { backgroundColor: "#FEE2E2" }]}
                  >
                    <Flame size={20} color="#EF4444" />
                  </View>
                  <Text style={styles.statCardTitle}>Streak</Text>
                </View>
                <Text style={styles.statCardValue}>
                  {user?.current_streak || 0}
                </Text>
                <Text style={styles.statCardSubtext}>days in a row</Text>
              </View>
            </View>
          </View>

          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => console.log("Navigate to camera")}
              >
                <View
                  style={[styles.actionIcon, { backgroundColor: "#F0FDF4" }]}
                >
                  <Camera size={24} color="#10B981" />
                </View>
                <Text style={styles.actionText}>Add Meal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => console.log("Navigate to food scanner")}
              >
                <View
                  style={[styles.actionIcon, { backgroundColor: "#EFF6FF" }]}
                >
                  <Target size={24} color="#3B82F6" />
                </View>
                <Text style={styles.actionText}>Scan Food</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={handleOpenShoppingList}
              >
                <View
                  style={[styles.actionIcon, { backgroundColor: "#FEF3C7" }]}
                >
                  <ShoppingCart size={24} color="#F59E0B" />
                </View>
                <Text style={styles.actionText}>Shopping</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => console.log("Navigate to statistics")}
              >
                <View
                  style={[styles.actionIcon, { backgroundColor: "#F3E8FF" }]}
                >
                  <TrendingUp size={24} color="#8B5CF6" />
                </View>
                <Text style={styles.actionText}>Statistics</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.activitySection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Meals</Text>
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={() => console.log("View all meals")}
              >
                <Text style={styles.viewAllText}>View All</Text>
                <ChevronRight size={16} color="#10B981" />
              </TouchableOpacity>
            </View>

            <View style={styles.activityList}>
              {isLoading ? (
                <View style={styles.activityItem}>
                  <Text style={styles.activityTitle}>Loading meals...</Text>
                </View>
              ) : processedMealsData.recentMeals.length > 0 ? (
                processedMealsData.recentMeals.map((meal, index) => (
                  <TouchableOpacity
                    key={meal.meal_id || `meal-${index}`}
                    style={[
                      styles.activityItem,
                      index === processedMealsData.recentMeals.length - 1 &&
                        styles.lastActivityItem,
                    ]}
                  >
                    <View
                      style={[
                        styles.activityIcon,
                        { backgroundColor: "#F0FDF4" },
                      ]}
                    >
                      <Camera size={20} color="#10B981" />
                    </View>
                    <View style={styles.activityContent}>
                      <Text style={styles.activityTitle}>
                        {meal.name || "Unknown Meal"}
                      </Text>
                      <Text style={styles.activityTime}>
                        {meal.created_at && formatTime(meal.created_at)}
                      </Text>
                    </View>
                    <Text style={styles.activityCalories}>
                      {meal.calories || 0} kcal
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.activityItem}>
                  <View
                    style={[
                      styles.activityIcon,
                      { backgroundColor: "#F3F4F6" },
                    ]}
                  >
                    <Target size={20} color="#9CA3AF" />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityTitle}>No meals today</Text>
                    <Text style={styles.activityTime}>Add your first meal</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.activityBadge}
                    onPress={() => console.log("Add meal")}
                  >
                    <Text style={styles.activityBadgeText}>Add Meal</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          <View style={styles.bottomSpacing} />
        </ScrollView>

        <ShoppingList
          visible={showShoppingList}
          onClose={handleCloseShoppingList}
        />
      </SafeAreaView>
    </ErrorBoundary>
  );
});

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAFAFA",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  profileContainer: {
    position: "relative",
    marginRight: 12,
  },
  profileImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
  },
  onlineIndicator: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#10B981",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  headerInfo: {
    flex: 1,
  },
  dateText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  greetingCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  greetingGradient: {
    padding: 24,
  },
  greetingContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greetingLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  greetingIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  greetingText: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "500",
  },
  greetingName: {
    fontSize: 24,
    color: "#FFFFFF",
    fontWeight: "700",
    marginTop: 2,
  },
  greetingStats: {
    alignItems: "flex-end",
  },
  statBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  statBadgeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  progressSection: {
    marginBottom: 32,
  },
  statsSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 0.5,
    borderColor: "#F3F4F6",
  },
  statCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  statCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  statCardValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  statCardSubtext: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "500",
  },
  actionsSection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  actionCard: {
    width: (width - 56) / 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 0.5,
    borderColor: "#F3F4F6",
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  activitySection: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#10B981",
  },
  activityList: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 0.5,
    borderColor: "#F3F4F6",
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  lastActivityItem: {
    borderBottomWidth: 0,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  activityTime: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  activityCalories: {
    fontSize: 16,
    fontWeight: "600",
    color: "#10B981",
  },
  activityBadge: {
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  activityBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#059669",
  },
  bottomSpacing: {
    height: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#FFFFFF",
  },
  errorText: {
    fontSize: 16,
    color: "#DC2626",
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "500",
  },
  retryButton: {
    backgroundColor: "#10B981",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
});
