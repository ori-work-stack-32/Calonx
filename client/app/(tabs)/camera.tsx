import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Animated,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/src/store";
import {
  analyzeMeal,
  postMeal,
  clearPendingMeal,
  clearError,
} from "@/src/store/mealSlice";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/src/i18n/context/LanguageContext";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import {
  CreditCard as Edit3,
  TriangleAlert as AlertTriangle,
  X,
  ChevronLeft,
} from "lucide-react-native";
import { useMealDataRefresh } from "@/hooks/useMealDataRefresh";
import { useTheme } from "@/src/context/ThemeContext";
import {
  ImageSelector,
  SelectedImage,
  NutritionOverview,
  IngredientsList,
  ActionButtons,
  HealthInsights,
  ScanningAnimation,
} from "@/components/camera";
import {
  MealTypeSelector,
  MealType,
} from "@/components/camera/MealTypeSelector";

const { width: screenWidth } = Dimensions.get("window");

interface Ingredient {
  name: string;
  calories: number;
  protein_g?: number;
  protein?: number;
  carbs_g?: number;
  carbs?: number;
  fats_g?: number;
  fat?: number;
  fats?: number;
  fiber_g?: number;
  fiber?: number;
  sugar_g?: number;
  sugar?: number;
  sodium_mg?: number;
  sodium?: number;
  estimated_portion_g?: number;
}

interface AnalysisData {
  name?: string;
  meal_name?: string;
  description?: string;
  calories: number;
  protein_g?: number;
  protein?: number;
  carbs_g?: number;
  carbs?: number;
  fats_g?: number;
  fat?: number;
  fats?: number;
  fiber_g?: number;
  fiber?: number;
  sugar_g?: number;
  sugar?: number;
  sodium_mg?: number;
  sodium?: number;
  saturated_fats_g?: number;
  polyunsaturated_fats_g?: number;
  monounsaturated_fats_g?: number;
  omega_3_g?: number;
  omega_6_g?: number;
  cholesterol_mg?: number;
  serving_size_g?: number;
  ingredients?: Ingredient[];
  healthScore?: string;
  recommendations?: string;
  cookingMethod?: string;
  cooking_method?: string;
  food_category?: string;
  confidence?: number;
  servingSize?: string;
  healthNotes?: string;
}

export default function CameraScreen() {
  const { t } = useTranslation();
  const { isRTL } = useLanguage();
  const dispatch = useDispatch<AppDispatch>();
  const { refreshAllMealData, refreshMealData, immediateRefresh } =
    useMealDataRefresh();
  const { colors, isDark } = useTheme();

  const { pendingMeal, isAnalyzing, isPosting, isUpdating, error } =
    useSelector((state: RootState) => state.meal);

  // Local state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [userComment, setUserComment] = useState("");
  const [editedIngredients, setEditedIngredients] = useState<Ingredient[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(
    null
  );
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [hasBeenAnalyzed, setHasBeenAnalyzed] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showScanAnimation, setShowScanAnimation] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<MealType | null>(
    null
  );
  const [showMealTypeSelector, setShowMealTypeSelector] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const nutritionCardAnim = useRef(new Animated.Value(0)).current;

  // Refs
  const scrollViewRef = useRef<ScrollView>(null);

  // Request camera permission on mount
  useEffect(() => {
    const requestCameraPermission = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    };
    requestCameraPermission();
  }, []);

  // Clear error on mount
  useEffect(() => {
    dispatch(clearError());
  }, [dispatch]);

  // Update local state when pendingMeal changes
  useEffect(() => {
    if (pendingMeal?.analysis) {
      setAnalysisData(pendingMeal.analysis);
      const ingredients = pendingMeal.analysis.ingredients || [];
      setEditedIngredients(ingredients);
      setHasBeenAnalyzed(true);
      setShowResults(true);

      if (pendingMeal.image_base_64) {
        const imageUri = pendingMeal.image_base_64.startsWith("data:")
          ? pendingMeal.image_base_64
          : `data:image/jpeg;base64,${pendingMeal.image_base_64}`;
        setSelectedImage(imageUri);
      }

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(nutritionCardAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
      ]).start();
    }
  }, [pendingMeal, fadeAnim, slideAnim, nutritionCardAnim]);

  // Helper function to get nutrition value with fallbacks
  const getNutritionValue = (
    data: AnalysisData | Ingredient | undefined,
    field: string
  ): number => {
    if (!data) return 0;

    const variations = [
      field,
      field.replace("_g", ""),
      field.replace("_mg", ""),
      field.replace("g", ""),
      field.replace("mg", ""),
    ];

    for (const variation of variations) {
      const value = data[variation as keyof typeof data];
      if (typeof value === "number" && value > 0) {
        return Math.round(value);
      }
      if (typeof value === "string" && !isNaN(parseFloat(value))) {
        return Math.round(parseFloat(value));
      }
    }
    return 0;
  };

  // Helper function to get meal name
  const getMealName = (data: AnalysisData): string => {
    return data?.name || data?.meal_name || "Analyzed Meal";
  };

  // Image selection handlers
  const handleTakePhoto = async () => {
    if (!selectedMealType) {
      Alert.alert(
        "Select Meal Type",
        "Please select a meal type before taking a photo"
      );
      return;
    }

    if (hasPermission === null) {
      Alert.alert(
        t("common.error"),
        "Camera permission is still being checked."
      );
      return;
    }
    if (!hasPermission) {
      Alert.alert(
        t("camera.permission"),
        "Camera permission is required to take photos. Please grant permission in settings."
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        setSelectedImage(imageUri);
        resetAnalysisState();
        setShowResults(false);
        // Hide meal type selector once an image is selected
        setShowMealTypeSelector(false);
      }
    } catch (error) {
      console.error("Camera error:", error);
      Alert.alert(t("common.error"), "Failed to take photo");
    }
  };

  const handleSelectFromGallery = async () => {
    if (!selectedMealType) {
      Alert.alert(
        "Select Meal Type",
        "Please select a meal type before selecting from gallery"
      );
      return;
    }
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          t("camera.permission"),
          "Gallery permission is required to select photos"
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        setSelectedImage(imageUri);
        resetAnalysisState();
        setShowResults(false);
        // Hide meal type selector once an image is selected
        setShowMealTypeSelector(false);
      }
    } catch (error) {
      console.error("Gallery error:", error);
      Alert.alert(t("common.error"), "Failed to select image");
    }
  };

  // Reset analysis state when new image is selected or analysis is discarded
  const resetAnalysisState = () => {
    setAnalysisData(null);
    setEditedIngredients([]);
    setUserComment("");
    setHasBeenAnalyzed(false);
    dispatch(clearPendingMeal());
    dispatch(clearError());

    // Reset animations
    fadeAnim.setValue(0);
    slideAnim.setValue(50);
    nutritionCardAnim.setValue(0);
  };

  // Initial analysis
  const handleAnalyzeImage = async () => {
    if (!selectedImage) {
      Alert.alert(t("common.error"), "Please select an image first");
      return;
    }
    if (!selectedMealType) {
      Alert.alert(t("common.error"), "Please select a meal type first");
      return;
    }

    // Check and cleanup storage before analysis
    try {
      const { StorageCleanupService } = await import(
        "@/src/utils/storageCleanup"
      );
      const storageOk = await StorageCleanupService.checkAndCleanupIfNeeded();
      if (!storageOk) {
        Alert.alert(
          "Storage Full",
          "Device storage is full. Please free up space and try again."
        );
        return;
      }
    } catch (error) {
      console.warn("Storage check failed:", error);
    }

    // Show scanning animation with progress
    setShowScanAnimation(true);
    setAnalysisProgress(0);

    // Simulate progress during analysis
    const progressInterval = setInterval(() => {
      setAnalysisProgress((prev) => Math.min(prev + 10, 90));
    }, 1000);

    try {
      const base64Image = await processImage(selectedImage);
      if (!base64Image) {
        clearInterval(progressInterval);
        setShowScanAnimation(false);
        Alert.alert(t("common.error"), "Could not process image.");
        return;
      }

      const analysisParams = {
        imageBase64: base64Image,
        language: isRTL ? "hebrew" : "english",
        includeDetailedIngredients: true,
        includeNutritionBreakdown: true,
        updateText:
          userComment.trim() || "Please provide detailed nutritional analysis.",
        mealType: selectedMealType.period,
        mealPeriod: selectedMealType.period,
      };

      console.log("🚀 Analysis parameters:", {
        hasImage: !!analysisParams.imageBase64,
        language: analysisParams.language,
        mealType: analysisParams.mealType,
        mealPeriod: analysisParams.mealPeriod,
      });

      console.log("🚀 Starting analysis with params:", {
        hasImage: !!analysisParams.imageBase64,
        language: analysisParams.language,
        mealType: analysisParams.mealType,
      });

      const result = await dispatch(analyzeMeal(analysisParams));

      clearInterval(progressInterval);
      setAnalysisProgress(100);

      if (analyzeMeal.fulfilled.match(result)) {
        console.log("✅ Analysis successful:", result.payload);
        setTimeout(() => {
          setShowScanAnimation(false);
          scrollViewRef.current?.scrollTo({ y: 0, animated: true });
        }, 500);
      } else {
        setShowScanAnimation(false);
        const errorMessage =
          result.payload ||
          "Failed to analyze meal. Please check your connection and try again.";
        console.error("❌ Analysis failed:", errorMessage);
        Alert.alert(
          t("camera.analysis_failed"),
          typeof errorMessage === "string"
            ? errorMessage
            : "Analysis failed. Please try again."
        );
      }
    } catch (error) {
      clearInterval(progressInterval);
      setShowScanAnimation(false);
      console.error("💥 Analysis error:", error);

      let errorMessage = "Analysis failed";
      if (error instanceof Error) {
        if (error.message.includes("Network")) {
          errorMessage =
            "Network error. Please check your connection and try again.";
        } else if (error.message.includes("timeout")) {
          errorMessage =
            "Analysis timed out. Please try again with a clearer image.";
        } else {
          errorMessage = error.message;
        }
      }

      Alert.alert(t("camera.analysis_failed"), errorMessage);
    }
  };

  // Handle scanning animation completion
  const handleScanComplete = () => {
    setShowScanAnimation(false);
  };

  // Re-analysis after edits
  const handleReAnalyze = async () => {
    if (!selectedImage || !hasBeenAnalyzed) {
      Alert.alert(t("common.error"), "No meal to re-analyze");
      return;
    }
    if (!selectedMealType) {
      Alert.alert(t("common.error"), "Please select a meal type first");
      return;
    }

    // Show scanning animation
    setShowScanAnimation(true);

    try {
      // Trigger immediate cache refresh first
      await immediateRefresh();

      const base64Image = await processImage(selectedImage);
      if (!base64Image) {
        setShowScanAnimation(false);
        Alert.alert(
          t("common.error") || "Error",
          "Could not process image for re-analysis."
        );
        return;
      }

      let updateText = userComment.trim();
      if (editedIngredients.length > 0) {
        const ingredientsList = editedIngredients
          .map((ing) => ing.name)
          .join(", ");
        updateText +=
          (updateText ? " " : "") +
          `Please re-analyze considering these ingredients: ${ingredientsList}. Provide updated nutritional information.`;
      }
      if (!updateText) {
        updateText =
          "Please re-analyze this meal with updated nutritional information.";
      }

      const reAnalysisParams = {
        imageBase64: base64Image,
        language: isRTL ? "hebrew" : "english",
        includeDetailedIngredients: true,
        includeNutritionBreakdown: true,
        updateText: updateText,
      };

      console.log("🔄 Starting re-analysis...");
      const result = await dispatch(analyzeMeal(reAnalysisParams)).unwrap();

      console.log("Re-analysis completed:", result);

      // Update local state immediately
      setAnalysisData(result.analysis);
      setEditedIngredients(result.analysis?.ingredients || []);
      setHasBeenAnalyzed(true);

      // Force complete cache invalidation and refresh
      await refreshAllMealData();

      // Hide scanning animation after successful completion
      setShowScanAnimation(false);

      console.log("✅ Re-analysis and cache refresh completed");

      Alert.alert(
        t("common.success") || "Success",
        t("camera.reAnalysisSuccess") || "Meal re-analyzed successfully!"
      );
    } catch (error) {
      setShowScanAnimation(false);
      console.error("❌ Re-analysis error:", error);
      Alert.alert(
        t("common.error") || "Error",
        error instanceof Error ? error.message : "Re-analysis failed"
      );
    }
  };

  // Save meal to database
  const handleSaveMeal = async () => {
    if (!analysisData) {
      Alert.alert(t("common.error"), "No analysis data to save");
      return;
    }
    if (!selectedMealType) {
      Alert.alert(t("common.error"), "Please select a meal type to save");
      return;
    }

    try {
      const result = await dispatch(postMeal());

      if (postMeal.fulfilled.match(result)) {
        await refreshAllMealData();

        Alert.alert(t("camera.save_success"), "Meal saved successfully!", [
          {
            text: t("common.ok"),
            onPress: () => {
              resetAnalysisState();
              setSelectedImage(null);
              setShowResults(false);
              // Reset meal type selection after saving
              setSelectedMealType(null);
              setShowMealTypeSelector(true);
            },
          },
        ]);
      } else {
        Alert.alert(
          t("camera.save_failed"),
          typeof result.payload === "string"
            ? result.payload
            : "Failed to save meal. Please try again."
        );
      }
    } catch (error) {
      Alert.alert(
        t("camera.save_failed"),
        error instanceof Error ? error.message : "Save failed"
      );
    }
  };

  // Discard analysis
  const handleDeleteMeal = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDeleteMeal = () => {
    resetAnalysisState();
    setSelectedImage(null);
    setShowDeleteConfirm(false);
    setShowResults(false);
    // Reset meal type selection after discarding
    setSelectedMealType(null);
    setShowMealTypeSelector(true);
    Alert.alert(t("common.success"), "Meal analysis discarded successfully");
  };

  // Ingredient editing functions
  const handleEditIngredient = (ingredient: Ingredient, index: number) => {
    setEditingIngredient({ ...ingredient });
    setEditingIndex(index);
    setShowEditModal(true);
  };

  const handleAddIngredient = () => {
    const newIngredient: Ingredient = {
      name: "",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium_mg: 0,
    };
    setEditingIngredient(newIngredient);
    setEditingIndex(-1);
    setShowEditModal(true);
  };

  const handleRemoveIngredient = (index: number) => {
    const updatedIngredients = editedIngredients.filter((_, i) => i !== index);
    setEditedIngredients(updatedIngredients);
  };

  const handleSaveIngredient = () => {
    if (!editingIngredient || !editingIngredient.name.trim()) {
      Alert.alert(t("common.error"), "Ingredient name is required");
      return;
    }

    const updatedIngredients = [...editedIngredients];

    if (editingIndex >= 0) {
      updatedIngredients[editingIndex] = editingIngredient;
    } else {
      updatedIngredients.push(editingIngredient);
    }

    setEditedIngredients(updatedIngredients);
    setShowEditModal(false);
    setEditingIngredient(null);
    setEditingIndex(-1);
  };

  // Calculate total nutrition from current data
  const calculateTotalNutrition = () => {
    const currentIngredients =
      editedIngredients.length > 0
        ? editedIngredients
        : analysisData?.ingredients || [];

    if (!analysisData && currentIngredients.length === 0) {
      return {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
        sugar: 0,
        sodium: 0,
      };
    }

    const totalCalories = analysisData?.calories || 0;
    const totalProtein = analysisData
      ? getNutritionValue(analysisData, "protein_g") ||
        getNutritionValue(analysisData, "protein") ||
        0
      : 0;
    const totalCarbs = analysisData
      ? getNutritionValue(analysisData, "carbs_g") ||
        getNutritionValue(analysisData, "carbs") ||
        0
      : 0;
    const totalFat = analysisData
      ? getNutritionValue(analysisData, "fats_g") ||
        getNutritionValue(analysisData, "fat") ||
        0
      : 0;
    const totalFiber = analysisData
      ? getNutritionValue(analysisData, "fiber_g") ||
        getNutritionValue(analysisData, "fiber") ||
        0
      : 0;
    const totalSugar = analysisData
      ? getNutritionValue(analysisData, "sugar_g") ||
        getNutritionValue(analysisData, "sugar") ||
        0
      : 0;
    const totalSodium = analysisData
      ? getNutritionValue(analysisData, "sodium_mg") ||
        getNutritionValue(analysisData, "sodium") ||
        0
      : 0;

    if (currentIngredients.length > 0) {
      let ingredientSumCalories = 0;
      let ingredientSumProtein = 0;
      let ingredientSumCarbs = 0;
      let ingredientSumFat = 0;
      let ingredientSumFiber = 0;
      let ingredientSumSugar = 0;
      let ingredientSumSodium = 0;

      currentIngredients.forEach((ingredient) => {
        ingredientSumCalories += getNutritionValue(ingredient, "calories");
        ingredientSumProtein +=
          getNutritionValue(ingredient, "protein_g") ||
          getNutritionValue(ingredient, "protein");
        ingredientSumCarbs +=
          getNutritionValue(ingredient, "carbs_g") ||
          getNutritionValue(ingredient, "carbs");
        ingredientSumFat +=
          getNutritionValue(ingredient, "fats_g") ||
          getNutritionValue(ingredient, "fat");
        ingredientSumFiber +=
          getNutritionValue(ingredient, "fiber_g") ||
          getNutritionValue(ingredient, "fiber");
        ingredientSumSugar +=
          getNutritionValue(ingredient, "sugar_g") ||
          getNutritionValue(ingredient, "sugar");
        ingredientSumSodium +=
          getNutritionValue(ingredient, "sodium_mg") ||
          getNutritionValue(ingredient, "sodium");
      });

      return {
        calories: ingredientSumCalories || totalCalories,
        protein: ingredientSumProtein || totalProtein,
        carbs: ingredientSumCarbs || totalCarbs,
        fat: ingredientSumFat || totalFat,
        fiber: ingredientSumFiber || totalFiber,
        sugar: ingredientSumSugar || totalSugar,
        sodium: ingredientSumSodium || totalSodium,
      };
    }

    return {
      calories: totalCalories,
      protein: totalProtein,
      carbs: totalCarbs,
      fat: totalFat,
      fiber: totalFiber,
      sugar: totalSugar,
      sodium: totalSodium,
    };
  };

  const renderAnalysisResults = () => {
    if (!analysisData) return null;

    const totalNutrition = calculateTotalNutrition();

    return (
      <View style={styles.resultsContainer}>
        {/* Header */}
        <View
          style={[styles.resultsHeader, { backgroundColor: colors.background }]}
        >
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.surface }]}
            onPress={() => router.back()}
          >
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.resultsTitle, { color: colors.text }]}>
            {getMealName(analysisData)}
          </Text>
          <TouchableOpacity
            style={[styles.menuButton, { backgroundColor: colors.emerald500 }]}
          >
            <View
              style={[styles.menuDot, { backgroundColor: colors.background }]}
            />
            <View
              style={[styles.menuDot, { backgroundColor: colors.background }]}
            />
            <View
              style={[styles.menuDot, { backgroundColor: colors.background }]}
            />
          </TouchableOpacity>
        </View>

        {/* Nutrition Overview */}
        <NutritionOverview
          nutrition={totalNutrition}
          mealName={getMealName(analysisData)}
        />

        {/* Action Buttons */}
        <ActionButtons
          onDelete={handleDeleteMeal}
          onReAnalyze={handleReAnalyze}
          onSave={handleSaveMeal}
          isUpdating={isUpdating}
          isPosting={isPosting}
        />

        {/* Ingredients List */}
        <IngredientsList
          ingredients={
            editedIngredients.length > 0
              ? editedIngredients
              : analysisData.ingredients || []
          }
          onEditIngredient={handleEditIngredient}
          onRemoveIngredient={handleRemoveIngredient}
          onAddIngredient={handleAddIngredient}
        />

        {/* Health Insights */}
        <HealthInsights
          recommendations={analysisData.recommendations}
          healthNotes={analysisData.healthNotes}
        />
      </View>
    );
  };

  const renderEditModal = () => (
    <Modal
      visible={showEditModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowEditModal(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
          <View
            style={[styles.modalHeader, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingIndex >= 0 ? "Edit" : "Add"} Ingredient
            </Text>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <X size={24} color={colors.icon} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Name *
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                value={editingIngredient?.name || ""}
                onChangeText={(text) =>
                  setEditingIngredient((prev) =>
                    prev ? { ...prev, name: text } : null
                  )
                }
                placeholder="Enter ingredient name"
                placeholderTextColor={colors.icon}
              />
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Calories
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={editingIngredient?.calories?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient((prev) =>
                      prev ? { ...prev, calories: parseFloat(text) || 0 } : null
                    )
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.icon}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Protein (g)
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={editingIngredient?.protein?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient((prev) =>
                      prev ? { ...prev, protein: parseFloat(text) || 0 } : null
                    )
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.icon}
                />
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Carbs (g)
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={editingIngredient?.carbs?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient((prev) =>
                      prev ? { ...prev, carbs: parseFloat(text) || 0 } : null
                    )
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.icon}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Fat (g)
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={editingIngredient?.fat?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient((prev) =>
                      prev ? { ...prev, fat: parseFloat(text) || 0 } : null
                    )
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.icon}
                />
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Fiber (g)
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={editingIngredient?.fiber?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient((prev) =>
                      prev ? { ...prev, fiber: parseFloat(text) || 0 } : null
                    )
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.icon}
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  Sugar (g)
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  value={editingIngredient?.sugar?.toString() || "0"}
                  onChangeText={(text) =>
                    setEditingIngredient((prev) =>
                      prev ? { ...prev, sugar: parseFloat(text) || 0 } : null
                    )
                  }
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.icon}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Sodium (mg)
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                value={editingIngredient?.sodium_mg?.toString() || "0"}
                onChangeText={(text) =>
                  setEditingIngredient((prev) =>
                    prev ? { ...prev, sodium_mg: parseFloat(text) || 0 } : null
                  )
                }
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={colors.icon}
              />
            </View>
          </ScrollView>

          <View
            style={[styles.modalActions, { borderTopColor: colors.border }]}
          >
            <TouchableOpacity
              style={[
                styles.modalCancelButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => setShowEditModal(false)}
            >
              <Text style={[styles.modalCancelText, { color: colors.icon }]}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalSaveButton,
                { backgroundColor: colors.emerald500 },
              ]}
              onPress={handleSaveIngredient}
            >
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderDeleteConfirmModal = () => (
    <Modal
      visible={showDeleteConfirm}
      animationType="fade"
      transparent={true}
      onRequestClose={() => setShowDeleteConfirm(false)}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[styles.confirmModalContent, { backgroundColor: colors.card }]}
        >
          <AlertTriangle size={48} color="#EF4444" />
          <Text style={[styles.confirmTitle, { color: colors.text }]}>
            Delete Analysis
          </Text>
          <Text style={[styles.confirmMessage, { color: colors.icon }]}>
            Are you sure you want to delete this meal analysis?
          </Text>

          <View style={styles.confirmActions}>
            <TouchableOpacity
              style={[
                styles.confirmCancelButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => setShowDeleteConfirm(false)}
            >
              <Text style={[styles.confirmCancelText, { color: colors.icon }]}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmDeleteButton}
              onPress={confirmDeleteMeal}
            >
              <Text style={styles.confirmDeleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      {/* Show meal type selector first, before any camera interaction */}
      {!selectedMealType ? (
        <View style={styles.mealTypeSelectionScreen}>
          <MealTypeSelector onSelect={setSelectedMealType} />
        </View>
      ) : !selectedImage ? (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={true}
          alwaysBounceVertical={true}
        >
          <View style={styles.imageSelectionContainer}>
            <View style={styles.selectedMealTypeBanner}>
              <Text
                style={[
                  styles.selectedMealTypeBannerText,
                  { color: colors.text },
                ]}
              >
                📸 Ready to capture your {selectedMealType.label.toLowerCase()}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedMealType(null);
                }}
                style={styles.changeMealTypeButton}
              >
                <Text style={styles.changeMealTypeButtonText}>Change</Text>
              </TouchableOpacity>
            </View>
            <ImageSelector
              onTakePhoto={handleTakePhoto}
              onSelectFromGallery={handleSelectFromGallery}
            />
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={true}
          alwaysBounceVertical={true}
        >
          <SelectedImage
            imageUri={selectedImage}
            userComment={userComment}
            isAnalyzing={isAnalyzing}
            hasBeenAnalyzed={hasBeenAnalyzed}
            onRemoveImage={() => {
              resetAnalysisState();
              setSelectedImage(null);
              setShowResults(false);
              setSelectedMealType(null);
              setShowMealTypeSelector(true);
            }}
            onRetakePhoto={handleTakePhoto}
            onAnalyze={handleAnalyzeImage}
            onCommentChange={setUserComment}
          />
          {showResults && analysisData && renderAnalysisResults()}
        </ScrollView>
      )}

      {/* Show selected meal type */}
      {selectedMealType && !showMealTypeSelector && !selectedImage && (
        <View style={styles.selectedMealType}>
          <Text style={styles.selectedMealText}>
            Selected: {selectedMealType.label}
          </Text>
          <TouchableOpacity
            onPress={() => setShowMealTypeSelector(true)}
            style={styles.changeMealType}
          >
            <Text style={styles.changeMealTypeText}>Change</Text>
          </TouchableOpacity>
        </View>
      )}

      {renderEditModal()}
      {renderDeleteConfirmModal()}

      {/* Enhanced Scanning Animation */}
      <ScanningAnimation
        visible={showScanAnimation}
        onComplete={handleScanComplete}
        progress={analysisProgress}
        isAnalyzing={false}
      />
    </SafeAreaView>
  );
}

const processImage = async (imageUri: string): Promise<string | null> => {
  try {
    console.log("Processing image:", imageUri);

    if (!imageUri || imageUri.trim() === "") {
      console.error("Invalid image URI provided");
      return null;
    }

    // Import image optimization utility
    const { optimizeImageForUpload } = await import(
      "@/src/utils/imageOptimiztion"
    );

    // Optimize image for analysis
    const optimizedBase64 = await optimizeImageForUpload(imageUri, {
      maxWidth: 1024,
      maxHeight: 1024,
      quality: 0.8,
      format: "jpeg",
    });

    if (!optimizedBase64 || optimizedBase64.length < 100) {
      console.error("Failed to optimize image or result too small");
      return null;
    }

    // Validate base64 format
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(optimizedBase64)) {
      console.error("Invalid base64 format generated");
      return null;
    }

    // Check size limit (10MB base64 ≈ 7.5MB binary)
    if (optimizedBase64.length > 10 * 1024 * 1024) {
      console.error("Optimized image still too large");
      return null;
    }

    console.log(
      "Image processed successfully, base64 length:",
      optimizedBase64.length
    );
    return optimizedBase64;
  } catch (error) {
    console.error("Error processing image:", error);
    return null;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mealTypeSelectionScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  header: {
    width: "100%",
    paddingVertical: 20,
    marginBottom: 24,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 34,
  },
  resultsContainer: {
    paddingHorizontal: 20,
  },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    marginBottom: 20,
    paddingHorizontal: 0,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  resultsTitle: {
    fontSize: 17,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
    letterSpacing: -0.24,
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.07,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  menuDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    borderRadius: 14,
    width: screenWidth - 40,
    maxHeight: "80%",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.33,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.24,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxHeight: 400,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    letterSpacing: -0.08,
  },
  modalInput: {
    borderWidth: 0.5,
    borderRadius: 10,
    padding: 12,
    fontSize: 17,
    letterSpacing: -0.24,
  },
  modalActions: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 0.33,
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 17,
    fontWeight: "400",
    letterSpacing: -0.24,
  },
  modalSaveButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalSaveText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.24,
  },
  confirmModalContent: {
    borderRadius: 14,
    padding: 20,
    alignItems: "center",
    marginHorizontal: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 6,
    textAlign: "center",
    letterSpacing: -0.24,
  },
  confirmMessage: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
    letterSpacing: -0.08,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  confirmCancelButton: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    borderWidth: 0,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmCancelText: {
    fontSize: 17,
    fontWeight: "400",
    color: "#007AFF",
    letterSpacing: -0.24,
  },
  confirmDeleteButton: {
    flex: 1,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmDeleteText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: -0.24,
  },
  selectedMealType: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 0,
  },
  selectedMealText: {
    fontSize: 17,
    fontWeight: "400",
    color: "#000000",
    letterSpacing: -0.24,
  },
  changeMealType: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#007AFF",
    borderRadius: 6,
  },
  changeMealTypeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.08,
  },
  imageSelectionContainer: {
    flex: 1,
  },
  selectedMealTypeBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 0,
  },
  selectedMealTypeBannerText: {
    fontSize: 17,
    fontWeight: "400",
    flex: 1,
    letterSpacing: -0.24,
  },
  changeMealTypeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#007AFF",
    borderRadius: 6,
  },
  changeMealTypeButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: -0.08,
  },
});
