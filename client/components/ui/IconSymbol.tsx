import { LucideIcon, Shield } from "lucide-react-native";
import {
  Home,
  Utensils,
  Camera,
  BarChart3,
  Calendar,
  Watch,
  Clock,
  User,
  ChefHat,
  MessageCircle,
  Scan,
  FileText,
  TrophyIcon,
} from "lucide-react-native";
import React from "react";
import { StyleProp, ViewStyle } from "react-native";

// Add all the symbols you are actually using in TabLayout
type SupportedSymbolName =
  | "house.fill"
  | "fork.knife"
  | "camera.fill"
  | "chart.bar.fill"
  | "calendar"
  | "watch.digital"
  | "clock.fill"
  | "person.fill"
  | "dining"
  | "message.fill"
  | "barcode.viewfinder"
  | "trophy.fill"
  | "shield.fill"
  | "doc.text.fill";

type IconMapping = Record<SupportedSymbolName, LucideIcon>;

const MAPPING: IconMapping = {
  "house.fill": Home,
  "fork.knife": Utensils,
  "camera.fill": Camera,
  "chart.bar.fill": BarChart3,
  calendar: Calendar,
  "watch.digital": Watch,
  "clock.fill": Clock,
  "person.fill": User,
  dining: ChefHat,
  "message.fill": MessageCircle,
  "barcode.viewfinder": Scan,
  "doc.text.fill": FileText,
  "trophy.fill": TrophyIcon,
  "shield.fill": Shield,
};

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: SupportedSymbolName;
  size?: number;
  color: string;
  style?: StyleProp<ViewStyle>;
}) {
  const IconComponent = MAPPING[name];

  if (!IconComponent) {
    console.warn(`Icon "${name}" is not mapped to any Lucide icon.`);
    // Return a fallback icon
    return <FileText size={size} color={color} style={style} />;
  }

  return <IconComponent size={size} color={color} style={style} />;
}
