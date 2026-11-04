import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  ImageBackground,
  Image,
  useWindowDimensions,
  Modal,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { initDatabase, insertRecipe, getAllSavedRecipes, deleteRecipeById, RecipeRecord } from './src/db/database';
import { askCulinaryHelper } from './src/services/aiService';

const DESIGN_WHEEL_SIZE = 370;
const FRAME_HORIZONTAL_INSET = 40;

function getDialMetrics(windowWidth: number, windowHeight: number) {
  const size = Math.max(
    240,
    Math.min(windowWidth - FRAME_HORIZONTAL_INSET, windowHeight * 0.52, 560)
  );
  const s = size / DESIGN_WHEEL_SIZE;
  return {
    size,
    s,
    center: size / 2,
    outerRadius: size / 2 - 28 * s,
    innerRadius: size / 2 - 82 * s,
    subRadius: size / 2 - 44 * s,
    outerDiameter: 48 * s,
    innerDiameter: 38 * s,
    subDiameter: 68 * s,
    badgeW: 90 * s,
    badgeH: 54 * s,
    regionalW: 140 * s,
    medallion: 90 * s,
    headerSideW: Math.round(windowWidth * 0.2),
  };
}

function circleBox(diameter: number) {
  return { width: diameter, height: diameter, borderRadius: diameter / 2 };
}

type MainTab = 'home' | 'search' | 'wheel' | 'butler' | 'profile';
const TAB_CENTER_OVERHANG = 32;
type Language = 'en' | 'fa';
type FusionCuisine = 'American' | 'Japanese' | 'Chinese' | 'Mexican';
type RecipeTab = 'nature' | 'ingredients' | 'steps' | 'secrets';

type CourseBucket = 'all' | 'appetizers' | 'mains' | 'sides' | 'desserts' | 'snacks' | 'drinks';

interface CourseBucketMeta {
  id: CourseBucket;
  titleEn: string;
  titleFa: string;
  icon: string;
  subtitleEn: string;
  subtitleFa: string;
}

const COURSE_BUCKETS: CourseBucketMeta[] = [
  { id: 'all', titleEn: 'All Courses', titleFa: 'همه منو', icon: '🍽️', subtitleEn: 'Complete Culinary Selection', subtitleFa: 'تمام بخش‌های سفره' },
  { id: 'appetizers', titleEn: 'Appetizers & Starters', titleFa: 'پیش‌غذا و اشتهاآور', icon: '🧆', subtitleEn: 'Warm Starters, Soups, Aush & Dolmeh', subtitleFa: 'آش، سوپ، کشک بادمجان، دلمه و کوفته' },
  { id: 'mains', titleEn: 'Main Dishes & Royal Rice', titleFa: 'غذاهای اصلی و چلو', icon: '🍲', subtitleEn: 'Slow-Cooked Stews, Basmati & Charcoal Kabobs', subtitleFa: 'خورشت‌های جاافتاده، کباب‌ها و پلوهای مجلسی' },
  { id: 'sides', titleEn: 'Sides, Relishes & Breads', titleFa: 'مخلفات، چاشنی و نان', icon: '🥗', subtitleEn: 'Boranis, Pickles, Fresh Herbs & Flatbreads', subtitleFa: 'سالادها، ترشیجات، بورانی و نان‌های سنتی' },
  { id: 'desserts', titleEn: 'Desserts & Traditional Sweets', titleFa: 'دسرها و شیرینی‌های سنتی', icon: '🍮', subtitleEn: 'Saffron Puddings, Halva, Ice Creams & Confections', subtitleFa: 'شله زرد، فالوده، حلوا، مسقطی و شیرینی‌ها' },
  { id: 'snacks', titleEn: 'Snacks, Kukus & Sandwiches', titleFa: 'ساندویچ، کوکو و خوراک سریع', icon: '🥪', subtitleEn: 'Herbed Frittatas, Croquettes & Street Sandwiches', subtitleFa: 'کوکوها، کتلت‌ها، شامی‌ها و ساندویچ‌های سنتی' },
  { id: 'drinks', titleEn: 'Drinks & Royal Sharbats', titleFa: 'نوشیدنی‌ها و شربت‌های درباری', icon: '🫖', subtitleEn: 'Chilled Cordials, Churned Doogh & Saffron Tea', subtitleFa: 'شربت‌های گیاهی، دوغ سنتی و چای زعفرانی' },
];

interface CategoryData {
  id: string;
  bucket: CourseBucket;
  titleEn: string;
  titleFa: string;
  persian: string;
  icon: string;
  dishesEn: string[];
  dishesFa: string[];
}

interface RegionalProvince {
  id: string;
  nameEn: string;
  nameFa: string;
  icon: string;
  specialtiesEn: string[];
  specialtiesFa: string[];
  descriptionEn: string;
  descriptionFa: string;
}

interface SuggestedItem {
  dish: string;
  category: string;
  icon: string;
  role: string;
}

interface ParsedRecipe {
  temperament: 'warm' | 'cold' | 'balanced' | 'unknown';
  temperamentRaw: string;
  servingSize: string;
  prepTime: string;
  cookTime: string;
  calories: string;
  protein: string;
  fat: string;
  carbs: string;
  sec1Title: string;
  sec1Body: string;
  sec2Title: string;
  ingredients: string[];
  sec3Title: string;
  steps: string[];
  sec4Title: string;
  sec4Body: string;
  rawText: string;
}

function cleanAsterisks(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/^\s*\*\s+/gm, '• ')
    .replace(/\*/g, '')
    .trim();
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/\[.*?\]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/…/g, '')
    .replace(/^\s*[\d\u0660-\u0669\u06F0-\u06F9]+[\.\-\)]\s*/, '')
    .replace(/[:\-#_•🔸✨🌿🥄🍳]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRecipeMetadata(text: string): ParsedRecipe {
  const getTag = (tag: string, fallback = '') => {
    const match = text.match(new RegExp(`\\[${tag}\\]:\\s*(.*)`, 'i'));
    return match ? cleanAsterisks(match[1]) : fallback;
  };

  const getSection = (num: number, defaultTitle: string) => {
    const match = text.match(new RegExp(`\\[SECTION_${num}\\]:\\s*([^\n\r]+)[\\r\\n]+([\\s\\S]*?)(?=\\[SECTION_|$)`, 'i'));
    if (match) {
      return { title: cleanAsterisks(match[1]), body: cleanAsterisks(match[2]) };
    }
    return { title: defaultTitle, body: '' };
  };

  const tempRaw = getTag('TEMPERAMENT', 'معتدل / Balanced');
  let tempType: 'warm' | 'cold' | 'balanced' | 'unknown' = 'balanced';
  const lower = tempRaw.toLowerCase();
  if (lower.includes('گرم') || lower.includes('warm') || lower.includes('hot')) tempType = 'warm';
  else if (lower.includes('سرد') || lower.includes('cold') || lower.includes('cool')) tempType = 'cold';

  const sec1 = getSection(1, 'طبع و تاریخچه / Nature & Temperament');
  const sec2 = getSection(2, 'مواد لازم / Ingredients');
  const sec3 = getSection(3, 'دستور پخت مرحله‌به‌مرحله / Step-by-Step Cooking');
  const sec4 = getSection(4, 'فوت کوزه‌گری / Chef Secrets');

  const ingredients = (sec2.body || '')
    .split('\n')
    .map((line) => cleanAsterisks(line))
    .filter((line) => line.length > 0 && !line.startsWith('مواد') && !line.startsWith('Ingred'));

  const steps = (sec3.body || '')
    .split('\n')
    .map((line) => cleanAsterisks(line))
    .filter((line) => line.length > 0 && (line.match(/^[\d\u0660-\u0669\u06F0-\u06F9]+[\.\-\)]/) || line.length > 15));

  return {
    temperament: tempType,
    temperamentRaw: tempRaw,
    servingSize: getTag('SERVING_SIZE', '350 grams / ۳۵۰ گرم'),
    prepTime: getTag('PREP_TIME', '25 mins'),
    cookTime: getTag('COOK_TIME', '60 mins'),
    calories: getTag('CALORIES', '480 kcal'),
    protein: getTag('PROTEIN', '26g'),
    fat: getTag('FAT', '16g'),
    carbs: getTag('CARBS', '58g'),
    sec1Title: sec1.title || 'طبع و تاریخچه / Nature & Temperament',
    sec1Body: sec1.body || cleanAsterisks(text),
    sec2Title: sec2.title || 'مواد لازم / Ingredients',
    ingredients,
    sec3Title: sec3.title || 'دستور پخت مرحله‌به‌مرحله / Step-by-Step Cooking',
    steps: steps.length > 0 ? steps : [sec3.body || 'No steps provided.'],
    sec4Title: sec4.title || 'فوت کوزه‌گری / Chef Secrets',
    sec4Body: sec4.body,
    rawText: cleanAsterisks(text),
  };
}

function getTimeOfDaySuggestion(): { labelEn: string; labelFa: string; icon: string; dishEn: string; dishFa: string; catId: string } {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 11) {
    return {
      icon: '🌅',
      labelEn: 'Morning Sobhaneh',
      labelFa: 'صبحانه اصیل',
      dishEn: 'Nan-e Sangak',
      dishFa: 'نان سنگک سنتی',
      catId: 'bread',
    };
  } else if (hour >= 11 && hour < 16) {
    return {
      icon: '☀️',
      labelEn: 'Midday Feast',
      labelFa: 'ناهار درباری',
      dishEn: 'Morassa Polo (Jeweled Rice)',
      dishFa: 'مرصع پلو مجلسی',
      catId: 'rice',
    };
  } else if (hour >= 16 && hour < 19) {
    return {
      icon: '☕',
      labelEn: 'Afternoon Asraneh',
      labelFa: 'عصرانه زعفرانی',
      dishEn: 'Masqati & Chai Zafarani',
      dishFa: 'مسقطی و چای زعفرانی',
      catId: 'pastries',
    };
  } else if (hour >= 19 && hour < 23) {
    return {
      icon: '🌙',
      labelEn: 'Evening Sham',
      labelFa: 'شام سنتی و آش',
      dishEn: 'Aush Reshteh (Noodle & Herb)',
      dishFa: 'آش رشته مجلسی با کشک',
      catId: 'aush',
    };
  } else {
    return {
      icon: '✨',
      labelEn: 'Late Night Herbal',
      labelFa: 'دمنوش شبانه آرامش',
      dishEn: 'Sharbat-e Sekanjabin',
      dishFa: 'شربت سکنجبین و خیار',
      catId: 'drinks',
    };
  }
}

const REGIONAL_PROVINCES: RegionalProvince[] = [
  {
    id: 'gilan',
    nameEn: 'Gilan & Rasht (UNESCO City of Food)',
    nameFa: 'گیلان و رشت (شهر خلاق خوراک‌شناسی یونسکو)',
    icon: '🌿',
    specialtiesEn: ['Mirza Ghasemi', 'Baghali Ghatogh', 'Kabab Torsh', 'Anarbij Stew', 'Torshi Tareh', 'Khoresht Morgh Torsh'],
    specialtiesFa: ['میرزا قاسمی اصیل دودی', 'باقلا قاتوق با تخم‌مرغ', 'کباب ترش گیلانی', 'خورشت اناربیج', 'ترش تره گیلان', 'خورشت مرغ ترش شمالی'],
    descriptionEn: 'Lush Caspian cuisine renowned for wild herbs, smoked eggplants, walnuts, garlic, and tart pomegranates.',
    descriptionFa: 'مهد طعم‌های ترش، سبزیجات وحشی کوهپایه (چوچاق و خالواش)، گردو، سیر محلی و رب انار جنگلی.',
  },
  {
    id: 'azerbaijan',
    nameEn: 'Azerbaijan & Tabriz',
    nameFa: 'آذربایجان و تبریز',
    icon: '🧆',
    specialtiesEn: ['Kofteh Tabrizi', 'Dolmeh Barg-e Mo', 'Tabrizi Dizi', 'Aush-e Omaj', 'Khoresht Havij'],
    specialtiesFa: ['کوفته تبریزی اعلا با آلو و گردو', 'دلمه برگ مو ملس تبریز', 'دیزی سنگی آذربایجان', 'آش اوماج', 'خورشت هویج تبریزی'],
    descriptionEn: 'Hearty northwestern mountain cooking defined by colossal meatballs, slow-cooked broths, and delicate stuffed vine leaves.',
    descriptionFa: 'دست‌پخت غنی اقلیم سردسیر آذربایجان با کوفته‌های باشکوه، آبگوشت‌های جاافتاده و خورشت هویج زعفرانی.',
  },
  {
    id: 'isfahan',
    nameEn: 'Isfahan (Heritage of the Silk Road)',
    nameFa: 'اصفهان (نصف جهان و جاده ابریشم)',
    icon: '🕌',
    specialtiesEn: ['Beryani Isfahani', 'Khoresht-e Mast (Saffron Sweet Stew)', 'Gosh-e Fil ba Doogh', 'Aush-e Shole Ghalamkar'],
    specialtiesFa: ['بریانی اصفهان در نان سنگک', 'خورشت ماست زعفرانی و گوشت گردن', 'گوش‌فیل با دوغ ترش', 'آش شله قلمکار درباری'],
    descriptionEn: 'Royal imperial cuisine balancing fragrant saffron meats with sweet-sour pairings like mint dough and crisp pastries.',
    descriptionFa: 'هنر والای دربار صفوی با خوراک‌های مقوی بریانی، دسر سنتی خورشت ماست و هماهنگی ترش و شیرین.',
  },
  {
    id: 'fars',
    nameEn: 'Fars & Shiraz',
    nameFa: 'فارس و شیراز (شهر راز و نارنج)',
    icon: '🌸',
    specialtiesEn: ['Kalam Polo Shirazi', 'Salad Shirazi', 'Halva Kaseh', 'Masqati Shirazi', 'Faloodeh Shirazi'],
    specialtiesFa: ['کلم پلو شیرازی با کوفته قلقلی', 'سالاد شیرازی اصل با آبغوره', 'حلوای کاسه شیراز', 'مسقطی لاری شیرازی', 'فالوده شیرازی با لیمو'],
    descriptionEn: 'Poetic garden dining characterized by aromatic tarragon, spiced meatballs, citrus sour verjuice, and rosewater.',
    descriptionFa: 'سفره عطرآگین شیراز با ترخون تازه، آبغوره ناب، کلم قمری لطیف، کوفته‌ریزه‌ها و مسقطی گلاب و زعفران.',
  },
  {
    id: 'persiangulf',
    nameEn: 'Khuzestan & Persian Gulf Coast',
    nameFa: 'خوزستان، بوشهر و کرانه خلیج فارس',
    icon: '🐟',
    specialtiesEn: ['Ghalieh Mahi (Tamarind Fish Stew)', 'Maygoo Polo (Spiced Shrimp)', 'Sambuseh Bandari', 'Ranginak'],
    specialtiesFa: ['قلیه ماهی جنوبی با تمبر هندی', 'میگو پلو با سبزی معطر و سیر', 'سمبوسه تند بندری', 'رنگینک خرمایی بوشهری'],
    descriptionEn: 'Exotic coastal seafood spiced with pungent fenugreek, coriander, tamarind, fiery chili, and rich dates.',
    descriptionFa: 'طعم‌های پرانرژی دریایی با عطر شنبلیله، گشنیز تازه، تمبر هندی غلیظ، فلفل تند هرمزگانی و خرمای دشتستان.',
  },
];

const ALL_CATEGORIES: CategoryData[] = [
  {
    id: 'khoresh',
    bucket: 'mains',
    titleEn: 'Khoresh',
    titleFa: 'خورشت',
    persian: 'خورشت‌ها',
    icon: '🍲',
    dishesEn: [
      'Ghormeh Sabzi', 'Gheimeh Sibzamini', 'Fesenjan', 'Karafss (Celery)',
      'Bademjan (Eggplant)', 'Aloo Esfenaj', 'Khoresht Rivas', 'Khoresht Kangar',
      'Khoresht Chaghaleh Badam', 'Khoresht Narengi', 'Khoresht Morgh Torsh', 'Khoresht Qarch',
      'Khoresht Kadoo', 'Khoresht Havij', 'Khoresht Aloocheh', 'Khoresht Gheimeh Bademjan',
    ],
    dishesFa: [
      'قورمه سبزی اصیل جاافتاده', 'قیمه سیب‌زمینی و لیمو عمانی', 'فسنجان گردو و رب انار ملس', 'خورشت کرفس معطر نعنا جعفری',
      'خورشت بادمجان غوره', 'خورشت آلو اسفناج مجلسی', 'خورشت ریواس کوهستانی', 'خورشت کنگر سنتی',
      'خورشت چغاله بادام نوبرانه', 'خورشت نارنگی معطر', 'خورشت مرغ ترش شمالی', 'خورشت قارچ با گوشت یا مرغ',
      'خورشت کدو سبز', 'خورشت هویج و آلو', 'خورشت آلوچه ترش', 'خورشت قیمه بادمجان مجلسی',
    ],
  },
  {
    id: 'rice',
    bucket: 'mains',
    titleEn: 'Rice &\nTahdig',
    titleFa: 'برنج و\nته‌دیگ',
    persian: 'چلو و پلوها',
    icon: '🍚',
    dishesEn: [
      'Chelow with Golden Potato Tahdig', 'Kateh ba Roghan Heyvani', 'Baghali Polo ba Mahiche', 'Zereshk Polo ba Morgh',
      'Sabzi Polo ba Mahi', 'Tahchin Morgh o Goosht', 'Tahchin Esfenaj', 'Lubia Polo ba Tahdig',
      'Albaloo Polo', 'Morassa Polo', 'Shirin Polo', 'Kalam Polo Shirazi',
      'Havij Polo', 'Reshteh Polo', 'Adas Polo', 'Dami Baghali',
    ],
    dishesFa: [
      'چلو با ته‌دیگ سیب‌زمینی زعفرانی', 'کته دودی با روغن حیوانی', 'باقالی پلو با ماهیچه مجلسی', 'زرشک پلو با مرغ زعفرانی',
      'سبزی پلو با ماهی سفید', 'ته‌چین مرغ و گوشت قالبی', 'ته‌چین اسفناج زعفرانی', 'لوبیا پلو با گوشت تکه‌ای و ته‌دیگ',
      'آلبالو پلو با کوفته قلقلی', 'مرصع پلو مجلسی با خلال و زرشک', 'شیرین پلو اعلا عروسی', 'کلم پلو شیرازی با ترخون و کوفته',
      'هویج پلو زعفرانی', 'رشته پلو با گوشت قلقلی', 'عدس پلو با کشمش و خرما', 'دمی باقالی با نیمرو',
    ],
  },
  {
    id: 'kabob',
    bucket: 'mains',
    titleEn: 'Kabob',
    titleFa: 'کباب',
    persian: 'کباب‌ها',
    icon: '🍢',
    dishesEn: [
      'Kabob Koobideh', 'Joojeh Kabob with Saffron & Lemon', 'Kabab Barg', 'Shishlik',
      'Kabab Chenjeh', 'Kabab Torshi', 'Kabab Tabei', 'Kabab Hosseini', 'Dandeh Kabab',
    ],
    dishesFa: [
      'کباب کوبیده زعفرانی مجلسی', 'جوجه کباب با زعفران و آبلیمو', 'کباب برگ فیله گوسفندی', 'شیشلیک شاندیز مشهد',
      'کباب چنجه مغز راسته', 'کباب ترش گیلانی با گردو و چوچاق', 'کباب تابه‌ای سنتی با گوجه', 'کباب حسینی چوبی', 'دنده کباب کرمانشاهی',
    ],
  },
  {
    id: 'meatdishes',
    bucket: 'mains',
    titleEn: 'Meat\nDishes',
    titleFa: 'غذاهای\nگوشتی',
    persian: 'غذاهای گوشتی',
    icon: '🍖',
    dishesEn: [
      'Chelow Mahiche (Lamb Shank)', 'Chelow Gardan (Lamb Neck)', 'Beryani Isfahani in Sangak',
      'Tas Kabab ba Beh', 'Khorak-e Zaban ba Gharch', 'Khorak-e Maghz',
    ],
    dishesFa: [
      'چلو ماهیچه مجلسی شاه‌عباسی', 'چلو گردن گوسفندی نرم و زعفرانی', 'بریانی اصیل اصفهان در نان سنگک',
      'تاس کباب با به و آلو', 'خوراک زبان با سس قارچ', 'خوراک مغز و سیر داغ',
    ],
  },
  {
    id: 'chicken',
    bucket: 'mains',
    titleEn: 'Chicken',
    titleFa: 'مرغ',
    persian: 'خوراک مرغ',
    icon: '🍗',
    dishesEn: [
      'Morgh Zaferani (Saffron Braised)', 'Akbar Joojeh with Pomegranate Sauce',
      'Morgh-e Shekam Por', 'Kabab Deigi Morgh', 'Morgh o Moz Polo',
    ],
    dishesFa: [
      'مرغ زعفرانی غلیظ مجلسی', 'اکبر جوجه مازندرانی با سس انار',
      'مرغ شکم‌پر با گردو و آلو', 'کباب تابه‌ای مرغ زعفرانی', 'مرغ پلو با موز',
    ],
  },
  {
    id: 'seafood',
    bucket: 'mains',
    titleEn: 'Sea Food',
    titleFa: 'دریایی',
    persian: 'ماهی و میگو',
    icon: '🐟',
    dishesEn: [
      'Mahi Shekam Por', 'Ghalieh Mahi', 'Mahi Sefid Polo ba Naranj', 'Maygoo Polo', 'Ghalieh Maygoo',
    ],
    dishesFa: [
      'ماهی سفید شکم‌پر تنوری شمالی', 'قلیه ماهی جنوبی با تمبر هندی', 'سبزی پلو با ماهی سفید و نارنج', 'میگو پلو بوشهری', 'قلیه میگو تمبر هندی',
    ],
  },
  {
    id: 'abgosht',
    bucket: 'mains',
    titleEn: 'Ab-Gosht',
    titleFa: 'آبگوشت',
    persian: 'دیزی و آبگوشت',
    icon: '🍲',
    dishesEn: [
      'Traditional Dizi Sangak', 'Ab-Gosht Bozbash ba Sabzi', 'Ab-Gosht Kashk',
      'Ab-Gosht Gandom', 'Ab-Gosht Na’na Jafari', 'Ab-Gosht Lapeh o Limoo Amani',
    ],
    dishesFa: [
      'دیزی سنگی با سنگک داغ و دنبه', 'آبگوشت بزباش با سبزیجات معطر', 'آبگوشت کشک اراکی',
      'آبگوشت گندم سنتی', 'آبگوشت نعنا جعفری', 'آبگوشت لپه و لیمو عمانی',
    ],
  },
  {
    id: 'aush',
    bucket: 'appetizers',
    titleEn: 'Aush &\nSoups',
    titleFa: 'آش و\nسوپ',
    persian: 'آش و سوپ‌ها',
    icon: '🥣',
    dishesEn: [
      'Aush Reshteh', 'Aush-e Jo', 'Aush-e Doogh', 'Aush-e Shole Ghalamkar',
      'Aush-e Anar', 'Soup Gojeh Farangi', 'Soup Piaz', 'Kalleh Joosh',
    ],
    dishesFa: [
      'آش رشته مجلسی با کشک', 'آش جو لعاب‌دار سنتی', 'آش دوغ سرعین اردبیل', 'آش شله قلمکار درباری',
      'آش انار ملس شیرازی', 'سوپ گوجه‌فرنگی و برنج', 'سوپ پیاز کاراملی سنتی', 'کله‌جوش غلیظ با کشک و گردو',
    ],
  },
  {
    id: 'appetizers',
    bucket: 'appetizers',
    titleEn: 'Hot\nStarters',
    titleFa: 'پیش‌غذا\nگرم',
    persian: 'پیش‌غذاهای گرم',
    icon: '🧆',
    dishesEn: [
      'Mirza Ghasemi', 'Kashk-e Bademjan', 'Baghali Ghatogh',
      'Nargesi Esfenaj', 'Nazkhatoon',
    ],
    dishesFa: [
      'میرزاقاسمی دودی با سیر تازه', 'کشک بادمجان مجلسی با نعنا داغ', 'باقلا قاتوق اصیل با سیر و شوید',
      'نرگسی اسفناج و سیر داغ', 'نازخاتون شمالی با آبغوره و ریحان',
    ],
  },
  {
    id: 'dolmeh',
    bucket: 'appetizers',
    titleEn: 'Dolmeh',
    titleFa: 'دلمه',
    persian: 'انواع دلمه',
    icon: '🍃',
    dishesEn: [
      'Dolmeh Barg-e Mo', 'Dolmeh Bademjan', 'Dolmeh Felfel', 'Dolmeh Gojeh Farangi',
      'Dolmeh Piaz', 'Dolmeh Kalam Barg',
    ],
    dishesFa: [
      'دلمه برگ مو ملس تبریز با سرکه شیره', 'دلمه بادمجان بقچه‌ای شکم‌پر', 'دلمه فلفل دلمه‌ای رنگی مجلسی', 'دلمه گوجه فرنگی شکم‌پر',
      'دلمه پیاز سفید لایه‌ای', 'دلمه کلم برگ ارومیه',
    ],
  },
  {
    id: 'kofteh',
    bucket: 'appetizers',
    titleEn: 'Kofteh',
    titleFa: 'کوفته',
    persian: 'کوفته‌ها',
    icon: '🧆',
    dishesEn: [
      'Kofteh Tabrizi', 'Kofteh Berenji', 'Kofteh Tokhm-e Morghi', 'Kofteh Ghelgheli',
    ],
    dishesFa: [
      'کوفته تبریزی بزرگ با تخم‌مرغ و آلو', 'کوفته برنجی اصفهان با سبزی معطر', 'کوفته تخم‌مرغی مغزدار', 'کوفته قلقلی در سس گوجه و نعنا',
    ],
  },
  {
    id: 'borani',
    bucket: 'sides',
    titleEn: 'Borani',
    titleFa: 'بورانی',
    persian: 'بورانی و ماست',
    icon: '🥣',
    dishesEn: [
      'Borani Esfenaj', 'Borani Bademjan', 'Borani Kadoo', 'Borani Kangar', 'Mast-o Khiar ba Gol-e Mohammadi',
    ],
    dishesFa: [
      'بورانی اسفناج و ماست چکیده موسیر', 'بورانی بادمجان کبابی دودی', 'بورانی کدو سبز با نعنا خشک', 'بورانی کنگر بهاری با سیر', 'ماست و خیار سنتی با گل سرخ',
    ],
  },
  {
    id: 'salads',
    bucket: 'sides',
    titleEn: 'Salads',
    titleFa: 'سالاد',
    persian: 'سالادها',
    icon: '🥗',
    dishesEn: [
      'Salad Shirazi', 'Salad Olivieh', 'Zeytoon Parvardeh', 'Salad Fasl ba Special Dressing', 'Salad Kahoo ba Sekanjabin',
    ],
    dishesFa: [
      'سالاد شیرازی اصل با نعنا و آبغوره', 'سالاد الویه مرغ مجلسی با سس مایونز', 'زیتون پرورده رودبار با چوچاق', 'سالاد فصل با سس مخصوص', 'سالاد کاهو سنتی با سس سکنجبین',
    ],
  },
  {
    id: 'torshi',
    bucket: 'sides',
    titleEn: 'Torshi',
    titleFa: 'ترشی',
    persian: 'ترشی و شور',
    icon: '🫙',
    dishesEn: [
      'Torshi Liteh', 'Torshi Seer (7-Year Garlic)', 'Torshi Haft-e Bijar', 'Khiarshoor ba Tarkhoon', 'Torshi Anbeh Bandari',
    ],
    dishesFa: [
      'ترشی لیته بادمجان و سیاه‌دانه', 'سیرترشی هفت‌ساله قهوه‌ای', 'ترشی هفت‌بیجار تند گیلان', 'خیارشور سنتی با ترخون و سیر', 'ترشی انبه بندری تند',
    ],
  },
  {
    id: 'bread',
    bucket: 'sides',
    titleEn: 'Bread',
    titleFa: 'نان',
    persian: 'نان‌های سنتی',
    icon: '🫓',
    dishesEn: [
      'Nan-e Sangak', 'Nan-e Barbari with Sesame', 'Nan-e Lavash', 'Nan-e Taftoon', 'Nan-e Shirmal',
    ],
    dishesFa: [
      'نان سنگک سنتی داغ', 'نان بربری کنجدی تنوری', 'نان لواش نازک سنتی', 'نان تافتون محلی', 'نان شیرمال زعفرانی معطر',
    ],
  },
  {
    id: 'sandwiches',
    bucket: 'snacks',
    titleEn: 'Sandwich',
    titleFa: 'ساندویچ',
    persian: 'ساندویچ‌ها',
    icon: '🥪',
    dishesEn: [
      'Sandwich Kotlet ba Khiarshoor o Gojeh', 'Sandwich Zaban', 'Sandwich Sosis Bandari', 'Sandwich Maghz',
    ],
    dishesFa: [
      'ساندویچ کتلت مامان‌پز با خیارشور و گوجه', 'ساندویچ زبان گوساله سسی', 'سوسیس بندری تند و آتشین', 'ساندویچ مغز گوسفندی',
    ],
  },
  {
    id: 'kotlets',
    bucket: 'snacks',
    titleEn: 'Kotlets',
    titleFa: 'کتلت',
    persian: 'کتلت‌ها',
    icon: '🥩',
    dishesEn: [
      'Kotlet Goosht', 'Kotlet Morgh', 'Kotlet Mahi',
    ],
    dishesFa: [
      'کتلت گوشت زعفرانی با آرد نخودچی', 'کتلت مرغ ترد با جعفری', 'کتلت ماهی با ادویه کاری',
    ],
  },
  {
    id: 'kuku',
    bucket: 'snacks',
    titleEn: 'Kuku',
    titleFa: 'کوکو',
    persian: 'کوکوها',
    icon: '🍳',
    dishesEn: [
      'Kuku Sabzi with Barberries & Walnuts', 'Kuku Sibzamini', 'Kuku Lobia Sabz',
      'Kuku Shevid Baghala', 'Kuku Gol-Kalam', 'Kuku Morgh / Chaqartmeh',
    ],
    dishesFa: [
      'کوکو سبزی پفکی با زرشک و گردو', 'کوکو سیب‌زمینی پخته یا خام ترد', 'کوکو لوبیا سبز تبریزی با گوشت',
      'کوکو شوید باقلا اصیل', 'کوکو گل کلم با زعفران', 'کوکو مرغ و چغارتمه گیلانی',
    ],
  },
  {
    id: 'shami',
    bucket: 'snacks',
    titleEn: 'Shami',
    titleFa: 'شامی',
    persian: 'شامی‌ها',
    icon: '🍘',
    dishesEn: [
      'Shami Torsh Gilani', 'Shami Lapeh', 'Shami Rashti with Pomegranate Glaze', 'Shami Baboli',
    ],
    dishesFa: [
      'شامی ترش گیلانی در سس رب انار', 'شامی لپه پوک ترد با زعفران', 'شامی رشتی آبدار', 'شامی بابلی معطر شمالی',
    ],
  },
  {
    id: 'khorak',
    bucket: 'snacks',
    titleEn: 'Khorak',
    titleFa: 'خوراک',
    persian: 'خوراک‌های گرم',
    icon: '🥘',
    dishesEn: [
      'Khorak-e Loobia Chiti', 'Khorak-e Morgh o Gharch', 'Khorak-e Zaban ba Sauce',
    ],
    dishesFa: [
      'خوراک لوبیا چیتی لعاب‌دار با قارچ', 'خوراک مرغ و قارچ سسی با فلفل دلمه', 'خوراک زبان با سس خامه و قارچ',
    ],
  },
  {
    id: 'desserts',
    bucket: 'desserts',
    titleEn: 'Desserts',
    titleFa: 'دسرها',
    persian: 'دسر و پس‌غذا',
    icon: '🍮',
    dishesEn: [
      'Sholeh Zard', 'Ferni', 'Halwa Zafarani ba Golab',
      'Ranginak', 'Khoresht-e Mast',
    ],
    dishesFa: [
      'شله زرد نذری زعفرانی با خلال بادام و پسته', 'فرنی ابریشمی با آرد برنج و گلاب', 'حلوای تیره زعفرانی مجلسی',
      'رنگینک خرمایی بوشهری با گردو و دارچین', 'خورشت ماست شیرین اصفهان با گردن',
    ],
  },
  {
    id: 'pastries',
    bucket: 'desserts',
    titleEn: 'Pastries',
    titleFa: 'شیرینی',
    persian: 'شیرینی‌جات',
    icon: '🧁',
    dishesEn: [
      'Sohan-e Qom', 'Gaz-e Isfahan', 'Zoolbia & Bamieh', 'Goosh-e Fil',
      'Masqati Shirazi', 'Masqati Borideh in Strips', 'Shirini Keshmeshi',
      'Baklava Yazdi', 'Ghotab', 'Shirini Nokhodchi', 'Shirini Zaban',
    ],
    dishesFa: [
      'سوهان قم کره‌ای با پسته', 'گز لقمه‌ای پسته اصفهان', 'زولبیا و بامیه ترد زعفرانی', 'گوش‌فیل شهددار ترد',
      'مسقطی لاری معطر با خلال', 'مسقطی بریده نواری', 'شیرینی کشمشی ترد و نرم',
      'باقلوای هل و گلاب یزد', 'قطاب پودر قندی سنتی', 'شیرینی نخودچی عید', 'شیرینی زبان هزارلا',
    ],
  },
  {
    id: 'icecream',
    bucket: 'desserts',
    titleEn: 'Ice Cream',
    titleFa: 'بستنی',
    persian: 'بستنی و یخ در بهشت',
    icon: '🍨',
    dishesEn: [
      'Bastani Sonnati', 'Faloodeh Shirazi ba Ab-Limoo', 'Havij Bastani Float', 'Yakh dar Behesht',
    ],
    dishesFa: [
      'بستنی سنتی خامه‌دار زعفرانی با پسته', 'فالوده شیرازی با آبلیموی تازه', 'آب هویج بستنی پر از خامه', 'یخ در بهشت سنتی زعفرانی یا میوه‌ای',
    ],
  },
  {
    id: 'drinks',
    bucket: 'drinks',
    titleEn: 'Drinks',
    titleFa: 'نوشیدنی',
    persian: 'شربت‌ها',
    icon: '🫖',
    dishesEn: [
      'Doogh ba Gol-e Mohammadi & Mint', 'Sharbat-e Sekanjabin ba Khiar', 'Sharbat-e Khakshir',
      'Sharbat-e Tokhm-e Sharbati', 'Sharbat-e Golab', 'Sharbat-e Ab-Limoo',
      'Sharbat-e Beh-Limoo', 'Sharbat-e Zaferani', 'Sharbat-e Albaloo', 'Chai Saffron & Cardamom Brew',
    ],
    dishesFa: [
      'دوغ سنتی خنک با گل محمدی و نعنا', 'شربت سکنجبین و خیار رنده‌شده', 'شربت خاکشیر خنک و یخ‌مال',
      'شربت تخم شربتی با گلاب', 'شربت گلاب ناب کاشان', 'شربت آبلیمو شیرازی با زعفران',
      'شربت به لیمو اصیل', 'شربت زعفرانی درباری', 'شربت آلبالو خانگی', 'چای دم‌کشیده با هل و سرگل زعفران',
    ],
  },
];

function RecipeTabbedDisplay({
  parsed,
  lang,
  isSpeaking,
  speakingSection,
  currentStepIndex,
  onSpeakSection,
  onStopSpeech,
  onReadStep,
  onShowTemperament,
}: {
  parsed: ParsedRecipe;
  lang: Language;
  isSpeaking: boolean;
  speakingSection: string | null;
  currentStepIndex: number;
  onSpeakSection: (sectionKey: string, text: string) => void;
  onStopSpeech: () => void;
  onReadStep: (index: number) => void;
  onShowTemperament: () => void;
}) {
  const isRTL = lang === 'fa';
  const [activeTab, setActiveTab] = useState<RecipeTab>('steps');
  const [checkedIngredients, setCheckedIngredients] = useState<Record<number, boolean>>({});

  const getTemperamentStyle = (type: string) => {
    switch (type) {
      case 'warm':
        return { bg: '#431407', border: '#f97316', text: '#fdba74', labelEn: '🔥 Warm (Garmi)', labelFa: '🔥 طبع گرم (گرمی)' };
      case 'cold':
        return { bg: '#082f49', border: '#38bdf8', text: '#bae6fd', labelEn: '❄️ Cold (Sardi)', labelFa: '❄️ طبع سرد (سردی)' };
      default:
        return { bg: '#064e3b', border: '#34d399', text: '#a7f3d0', labelEn: '⚖️ Balanced (Motadel)', labelFa: '⚖️ طبع معتدل' };
    }
  };

  const tempStyle = getTemperamentStyle(parsed.temperament);

  return (
    <View style={{ flex: 1 }}>
      {/* Universal Floating Stop Button when audio is reading */}
      {isSpeaking && (
        <TouchableOpacity style={styles.floatingStopBar} onPress={onStopSpeech} activeOpacity={0.85}>
          <Text style={styles.floatingStopText}>⏹️ {lang === 'fa' ? 'توقف پخش صدا' : 'Stop Narration'}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.chipRow}>
        <View style={styles.infoChip}>
          <Text style={styles.infoChipLabel}>{lang === 'fa' ? 'آماده‌سازی' : 'Prep'}</Text>
          <Text style={styles.infoChipValue} numberOfLines={1}>⏱️ {parsed.prepTime}</Text>
        </View>
        <View style={styles.infoChip}>
          <Text style={styles.infoChipLabel}>{lang === 'fa' ? 'پخت' : 'Cook'}</Text>
          <Text style={styles.infoChipValue} numberOfLines={1}>🔥 {parsed.cookTime}</Text>
        </View>
        <TouchableOpacity
          style={[styles.infoChip, { backgroundColor: tempStyle.bg, borderColor: tempStyle.border }]}
          onPress={onShowTemperament}
          activeOpacity={0.8}
        >
          <Text style={[styles.infoChipLabel, { color: tempStyle.text }]}>{lang === 'fa' ? 'طبع ›' : 'Nature ›'}</Text>
          <Text style={[styles.infoChipValue, { color: tempStyle.text }]} numberOfLines={1}>
            {(lang === 'fa' ? tempStyle.labelFa : tempStyle.labelEn).replace(/\s*\(.*\)/, '')}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.macroCard}>
        {[
          { label: lang === 'fa' ? 'کالری' : 'Calories', value: parsed.calories },
          { label: lang === 'fa' ? 'پروتئین' : 'Protein', value: parsed.protein },
          { label: lang === 'fa' ? 'چربی' : 'Fat', value: parsed.fat },
          { label: lang === 'fa' ? 'کربوهیدرات' : 'Carbs', value: parsed.carbs },
        ].map((m, i) => (
          <View key={m.label} style={[styles.macroCol, i > 0 && styles.macroColDivider]}>
            <Text style={styles.macroBigValue} numberOfLines={1} adjustsFontSizeToFit>{m.value}</Text>
            <Text style={styles.macroSmallLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.macroCaption}>
        {lang === 'fa'
          ? `ارزش غذایی برای ۱ پرس = ${parsed.servingSize}`
          : `Per serving • ${parsed.servingSize}`}
      </Text>

      <View style={styles.recipeTabBarContainer}>
        {([
          { key: 'nature', label: lang === 'fa' ? 'طبع' : 'Nature' },
          { key: 'ingredients', label: lang === 'fa' ? 'مواد لازم' : 'Ingredients' },
          { key: 'steps', label: lang === 'fa' ? 'مراحل' : 'Steps' },
          { key: 'secrets', label: lang === 'fa' ? 'فوت کوزه‌گری' : 'Secrets' },
        ] as { key: RecipeTab; label: string }[]).map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.recipeTabBtn, activeTab === t.key && styles.recipeTabBtnActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.recipeTabBtnText, activeTab === t.key && styles.recipeTabBtnTextActive]} numberOfLines={1}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'nature' && (
        <View style={styles.recipeSectionBlock}>
          <View style={styles.sectionHeaderFlex}>
            <Text style={[styles.recipeSectionHeading, isRTL ? styles.textRTL : styles.textLTR]}>
              🌿 {parsed.sec1Title}
            </Text>
            <TouchableOpacity
              style={[styles.miniAudioBtn, isSpeaking && speakingSection === 'sec1' && styles.miniAudioBtnActive]}
              onPress={() => isSpeaking && speakingSection === 'sec1' ? onStopSpeech() : onSpeakSection('sec1', parsed.sec1Body)}
            >
              <Text style={styles.miniAudioText}>{isSpeaking && speakingSection === 'sec1' ? '⏹️ Stop' : '🔊 Read'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.recipeSectionBody, isRTL ? styles.textRTL : styles.textLTR]}>
            {parsed.sec1Body}
          </Text>
        </View>
      )}

      {activeTab === 'ingredients' && (
        <View style={styles.recipeSectionBlock}>
          <View style={styles.sectionHeaderFlex}>
            <Text style={[styles.recipeSectionHeading, isRTL ? styles.textRTL : styles.textLTR]}>
              🥄 {parsed.sec2Title}
            </Text>
            <TouchableOpacity
              style={[styles.miniAudioBtn, isSpeaking && speakingSection === 'sec2' && styles.miniAudioBtnActive]}
              onPress={() => isSpeaking && speakingSection === 'sec2' ? onStopSpeech() : onSpeakSection('sec2', parsed.ingredients.join('. '))}
            >
              <Text style={styles.miniAudioText}>{isSpeaking && speakingSection === 'sec2' ? '⏹️ Stop' : '🔊 Read'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.ingredientsGrid}>
            {parsed.ingredients.map((ing, i) => {
              const done = !!checkedIngredients[i];
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.8}
                  onPress={() => setCheckedIngredients((prev) => ({ ...prev, [i]: !prev[i] }))}
                  style={[styles.ingredientRow, isRTL && styles.ingredientRowRTL, done && styles.ingredientRowDone]}
                >
                  <View style={[styles.checkbox, done && styles.checkboxOn]}>
                    {done && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                  <Text style={[styles.ingredientText, isRTL ? styles.textRTL : styles.textLTR, done && styles.ingredientTextDone]}>
                    {ing}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {activeTab === 'steps' && (
        <View style={styles.recipeSectionBlock}>
          <View style={styles.sectionHeaderFlex}>
            <Text style={[styles.recipeSectionHeading, isRTL ? styles.textRTL : styles.textLTR]}>
              🍳 {parsed.sec3Title}
            </Text>
            {isSpeaking && (
              <TouchableOpacity style={[styles.miniAudioBtn, styles.miniAudioBtnActive]} onPress={onStopSpeech}>
                <Text style={styles.miniAudioText}>⏹️ Stop</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Voice Step Control Toolbar */}
          <View style={styles.voiceStepToolbar}>
            <Text style={styles.voiceStepLabel}>
              {lang === 'fa' ? 'دکمه‌های صوتی مراحل:' : 'Step Audio Assistant:'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={styles.stepControlBtn}
                onPress={() => onReadStep(Math.max(0, currentStepIndex - 1))}
              >
                <Text style={styles.stepControlBtnText}>⏮️ {lang === 'fa' ? 'قبل' : 'Prev'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stepControlBtn, styles.stepControlBtnHighlight]}
                onPress={() => onReadStep(currentStepIndex)}
              >
                <Text style={styles.stepControlBtnText}>🔁 {lang === 'fa' ? 'تکرار' : 'Repeat'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stepControlBtn}
                onPress={() => onReadStep(Math.min(parsed.steps.length - 1, currentStepIndex + 1))}
              >
                <Text style={styles.stepControlBtnText}>⏭️ {lang === 'fa' ? 'بعد' : 'Next'}</Text>
              </TouchableOpacity>
              {isSpeaking && (
                <TouchableOpacity
                  style={[styles.stepControlBtn, { backgroundColor: '#ef4444' }]}
                  onPress={onStopSpeech}
                >
                  <Text style={styles.stepControlBtnText}>⏹️</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            {parsed.steps.map((st, i) => {
              const isStepActive = isSpeaking && speakingSection === `step_${i}`;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.stepCardRow, isStepActive && styles.stepCardRowActive]}
                  onPress={() => onReadStep(i)}
                  activeOpacity={0.8}
                >
                  <View style={styles.stepNumberBadge}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.stepText, isRTL ? styles.textRTL : styles.textLTR]}>
                    {cleanForSpeech(st)}
                  </Text>
                  <Text style={styles.stepAudioIcon}>{isStepActive ? '🔊' : '▶️'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {activeTab === 'secrets' && (
        <View style={styles.recipeSectionBlock}>
          <View style={styles.sectionHeaderFlex}>
            <Text style={[styles.recipeSectionHeading, isRTL ? styles.textRTL : styles.textLTR]}>
              ✨ {parsed.sec4Title}
            </Text>
            <TouchableOpacity
              style={[styles.miniAudioBtn, isSpeaking && speakingSection === 'sec4' && styles.miniAudioBtnActive]}
              onPress={() => isSpeaking && speakingSection === 'sec4' ? onStopSpeech() : onSpeakSection('sec4', parsed.sec4Body)}
            >
              <Text style={styles.miniAudioText}>{isSpeaking && speakingSection === 'sec4' ? '⏹️ Stop' : '🔊 Read'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.recipeSectionBody, isRTL ? styles.textRTL : styles.textLTR]}>
            {parsed.sec4Body}
          </Text>
        </View>
      )}
    </View>
  );
}

function PersianAppInner() {
  const insets = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const dial = getDialMetrics(winWidth, winHeight);
  const [lang, setLang] = useState<Language>('en');

  const [selectedBucket, setSelectedBucket] = useState<CourseBucket>('all');
  const [selectedCategory, setSelectedCategory] = useState<CategoryData | null>(null);
  const [activeDish, setActiveDish] = useState<string | null>(null);
  const [recipeContent, setRecipeContent] = useState<string>('');
  const [parsedRecipe, setParsedRecipe] = useState<ParsedRecipe | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [tabBarHeight, setTabBarHeight] = useState<number>(0);
  const searchInputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [showCookbook, setShowCookbook] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showUserGuide, setShowUserGuide] = useState<boolean>(false);
  const [showRegionalModal, setShowRegionalModal] = useState<boolean>(false);
  const [savedRecipes, setSavedRecipes] = useState<RecipeRecord[]>([]);
  const [magnifiedId, setMagnifiedId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isHomeSurpriseActive, setIsHomeSurpriseActive] = useState<boolean>(false);
  const [subModalMode, setSubModalMode] = useState<'dial' | 'recipe'>('dial');
  const [showTemperamentInfo, setShowTemperamentInfo] = useState<boolean>(false);

  // Audio / Speech State
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speakingSection, setSpeakingSection] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [speechRate, setSpeechRate] = useState<number>(0.85);

  const [isFusionEnabled, setIsFusionEnabled] = useState<boolean>(false);
  const [selectedCuisine, setSelectedCuisine] = useState<FusionCuisine>('American');
  const [guestCount, setGuestCount] = useState<string>('');
  const [allergiesInput, setAllergiesInput] = useState<string>('');
  const [specialPreferences, setSpecialPreferences] = useState<string>('');
  const [suggestedCircles, setSuggestedCircles] = useState<SuggestedItem[]>([]);
  const [selectedButlerDish, setSelectedButlerDish] = useState<string | null>(null);
  const [butlerRecipeText, setButlerRecipeText] = useState<string>('');
  const [parsedButlerRecipe, setParsedButlerRecipe] = useState<ParsedRecipe | null>(null);
  const [butlerSuggestLoading, setButlerSuggestLoading] = useState<boolean>(false);
  const [butlerRecipeLoading, setButlerRecipeLoading] = useState<boolean>(false);

  // Wheel of Fortune Spin Animation State
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [spinLightIndex, setSpinLightIndex] = useState<number>(0);
  const spinAnim = useRef(new Animated.Value(0)).current;

  // Surprise Me Foreground Selection & Confirmation Dialog State
  const [showSurpriseModal, setShowSurpriseModal] = useState<boolean>(false);
  const [spinResultDish, setSpinResultDish] = useState<{ dish: string; category: CategoryData } | null>(null);

  const butlerScrollRef = useRef<ScrollView>(null);
  const timeMeal = getTimeOfDaySuggestion();

  useEffect(() => {
    initDatabase();
    refreshCookbook();
    return () => {
      Speech.stop();
    };
  }, []);

  const refreshCookbook = () => {
    const list = getAllSavedRecipes();
    setSavedRecipes(list);
  };

  const displayedCategories = useMemo(() => {
    if (selectedBucket === 'all') {
      return ALL_CATEGORIES;
    }
    return ALL_CATEGORIES.filter((c) => c.bucket === selectedBucket);
  }, [selectedBucket]);

  const allDishesIndexed = useMemo(() => {
    const list: { dishEn: string; dishFa: string; categoryEn: string; categoryFa: string; icon: string; category: CategoryData }[] = [];
    ALL_CATEGORIES.forEach((cat) => {
      cat.dishesEn.forEach((dEn, idx) => {
        const dFa = cat.dishesFa[idx] || dEn;
        list.push({
          dishEn: dEn,
          dishFa: dFa,
          categoryEn: cat.titleEn.replace('\n', ' '),
          categoryFa: cat.titleFa.replace('\n', ' '),
          icon: cat.icon,
          category: cat,
        });
      });
    });
    return list;
  }, []);

  const filteredSearchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allDishesIndexed.filter(
      (item) =>
        item.dishEn.toLowerCase().includes(q) ||
        item.dishFa.toLowerCase().includes(q) ||
        item.categoryEn.toLowerCase().includes(q) ||
        item.categoryFa.toLowerCase().includes(q)
    );
  }, [searchQuery, allDishesIndexed]);

  // Explicit, non-repeating audio engine
  const speakSanitizedText = (text: string, sectionKey: string) => {
    Speech.stop();
    const cleanScript = cleanForSpeech(text);
    if (!cleanScript) return;

    setIsSpeaking(true);
    setSpeakingSection(sectionKey);

    Speech.speak(cleanScript, {
      language: lang === 'fa' ? 'fa-IR' : 'en-US',
      pitch: 1.0,
      rate: speechRate,
      onDone: () => {
        setIsSpeaking(false);
        setSpeakingSection(null);
      },
      onStopped: () => {
        setIsSpeaking(false);
        setSpeakingSection(null);
      },
      onError: () => {
        setIsSpeaking(false);
        setSpeakingSection(null);
      },
    });
  };

  const stopActiveSpeech = () => {
    Speech.stop();
    setIsSpeaking(false);
    setSpeakingSection(null);
  };

  const handleReadStep = (index: number, activeParsed: ParsedRecipe | null) => {
    if (!activeParsed || !activeParsed.steps[index]) return;
    setCurrentStepIndex(index);
    const cleanStepContent = cleanForSpeech(activeParsed.steps[index]);
    const stepAnnouncement = lang === 'fa'
      ? `مرحله ${index + 1}: ${cleanStepContent}`
      : `Step ${index + 1}: ${cleanStepContent}`;
    speakSanitizedText(stepAnnouncement, `step_${index}`);
  };

  const handleSelectDish = async (dishName: string, categoryTitle: string, isFromHome = false) => {
    stopActiveSpeech();
    setCurrentStepIndex(0);
    setActiveDish(dishName);
    setRecipeContent('');
    setParsedRecipe(null);
    setLoading(true);
    setIsHomeSurpriseActive(isFromHome);
    setSubModalMode('recipe');

    const promptLanguageInstruction = lang === 'fa' 
      ? 'پاسخ را کاملاً به زبان فارسی اصیل با مقادیر دقیق ارائه دهید. بدون هیچ ستاره یا مارک‌داون بولد.' 
      : 'Provide the response in clear, authentic English with exact measurements without asterisks.';

    const prompt = `Provide the authentic recipe for "${dishName}" (Category: ${categoryTitle}).
${promptLanguageInstruction}
Calculate all macros STRICTLY PER 1 STANDARD SERVING and declare its gram weight in [SERVING_SIZE].
Adhere strictly to the required tags and no asterisks:
[TEMPERAMENT]: (State: Warm / Cold / Balanced)
[SERVING_SIZE]: (e.g. 350 grams / ۳۵۰ گرم)
[PREP_TIME]: (Time in minutes)
[COOK_TIME]: (Time in minutes)
[CALORIES]: (e.g. 480 kcal)
[PROTEIN]: (e.g. 26g)
[FAT]: (e.g. 16g)
[CARBS]: (e.g. 54g)

[SECTION_1]: [طبع و تاریخچه / Nature & Temperament]
[SECTION_2]: [مواد لازم / Ingredients]
[SECTION_3]: [دستور پخت مرحله‌به‌مرحله / Step-by-Step Cooking]
[SECTION_4]: [فوت کوزه‌گری / Chef Secrets]`;

    try {
      const response = await askCulinaryHelper(prompt);
      setRecipeContent(response);
      setParsedRecipe(parseRecipeMetadata(response));
    } catch (error: any) {
      Alert.alert(lang === 'fa' ? 'خطا در بارگذاری' : 'AI Request Failed', error.message || 'Could not fetch recipe');
    } finally {
      setLoading(false);
    }
  };

  // Wheel Spin Execution on selected course
  const triggerWheelSpinForCourse = (courseId: CourseBucket) => {
    setShowSurpriseModal(false);
    setSelectedBucket(courseId);
    setSpinResultDish(null);
    setIsSpinning(true);

    const eligibleCategories = courseId === 'all'
      ? ALL_CATEGORIES
      : ALL_CATEGORIES.filter((c) => c.bucket === courseId);

    const targetCategory = eligibleCategories.length > 0
      ? eligibleCategories[Math.floor(Math.random() * eligibleCategories.length)]
      : ALL_CATEGORIES[0];

    const dishList = lang === 'fa' ? targetCategory.dishesFa : targetCategory.dishesEn;
    const targetDish = dishList[Math.floor(Math.random() * dishList.length)];

    let lightTimer: any = null;
    let stepCount = 0;
    const totalSteps = 30;
    lightTimer = setInterval(() => {
      setSpinLightIndex((prev) => (prev + 1) % eligibleCategories.length);
      stepCount++;
      if (stepCount >= totalSteps) {
        clearInterval(lightTimer);
      }
    }, 100);

    spinAnim.setValue(0);
    Animated.timing(spinAnim, {
      toValue: 7,
      duration: 3200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      clearInterval(lightTimer);
      setIsSpinning(false);
      // Presents confirmation modal with chosen dish (Ask Yes/No)
      setSpinResultDish({ dish: targetDish, category: targetCategory });
    });
  };

  const handleConsultButler = async () => {
    stopActiveSpeech();
    setButlerSuggestLoading(true);
    setSuggestedCircles([]);
    setSelectedButlerDish(null);
    setButlerRecipeText('');
    setParsedButlerRecipe(null);

    const activeBucketMeta = COURSE_BUCKETS.find((b) => b.id === selectedBucket);
    const bucketFocus = selectedBucket !== 'all'
      ? `Focus strictly on course category: "${activeBucketMeta?.titleEn}" (${activeBucketMeta?.titleFa}).`
      : 'Harmonious multi-course banquet design.';

    let prompt = '';
    if (isFusionEnabled) {
      prompt = `You are the authentic Persian Royal Dining Host & Butler (میزبان), specializing in creative Persian-${selectedCuisine} fusion banquet design.
${bucketFocus}
Target Culture: ${selectedCuisine} cuisine fused with authentic Persian spices, herbs, and techniques.
Guests: ${guestCount || '4'}. Allergies: ${allergiesInput || 'None'}. Preferences: ${specialPreferences || `Innovative Persian-${selectedCuisine} harmony`}.
Craft an inventive 5-course Persian-${selectedCuisine} Fusion banquet.
Respond ONLY with a valid JSON array of 5 objects with no markdown fences, formatted as:
[
  {"dish": "Fusion Dish 1", "category": "Fusion", "icon": "🍲", "role": "${lang === 'fa' ? `غذای اول فیوژن ${selectedCuisine}` : `Item 1 (${selectedCuisine} Fusion)`}"},
  {"dish": "Fusion Dish 2", "category": "Fusion", "icon": "🍚", "role": "${lang === 'fa' ? 'غذای دوم فیوژن' : 'Item 2'}"},
  {"dish": "Fusion Dish 3", "category": "Fusion", "icon": "🥪", "role": "${lang === 'fa' ? 'پیش‌غذا یا همراه' : 'Item 3'}"},
  {"dish": "Fusion Dish 4", "category": "Fusion", "icon": "🥗", "role": "${lang === 'fa' ? 'چاشنی یا سالاد' : 'Item 4'}"},
  {"dish": "Fusion Dish 5", "category": "Fusion", "icon": "🍨", "role": "${lang === 'fa' ? 'دسر یا نوشیدنی' : 'Sweet Finish'}"}
]`;
    } else {
      prompt = `You are the authentic Persian Royal Dining Host & Butler (میزبان).
${bucketFocus}
Guests: ${guestCount || '4'}. Allergies: ${allergiesInput || 'None'}. Preferences: ${specialPreferences || 'Classic balanced banquet'}.
Recommend a harmonious 5-dish authentic Persian banquet matching this focus.
Respond ONLY with a valid JSON array of 5 objects with no markdown fences, formatted as:
[
  {"dish": "Dish Name", "category": "Category", "icon": "🍲", "role": "${lang === 'fa' ? 'انتخاب اول' : 'Course 1'}"},
  {"dish": "Dish Name 2", "category": "Category", "icon": "🍚", "role": "${lang === 'fa' ? 'انتخاب دوم' : 'Course 2'}"},
  {"dish": "Dish Name 3", "category": "Category", "icon": "🧆", "role": "${lang === 'fa' ? 'انتخاب سوم' : 'Course 3'}"},
  {"dish": "Dish Name 4", "category": "Category", "icon": "🥗", "role": "${lang === 'fa' ? 'انتخاب چهارم' : 'Course 4'}"},
  {"dish": "Dish Name 5", "category": "Category", "icon": "🍮", "role": "${lang === 'fa' ? 'انتخاب پنجم' : 'Course 5'}"}
]`;
    }

    try {
      const response = await askCulinaryHelper(prompt);
      const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed: SuggestedItem[] = JSON.parse(cleaned);
      setSuggestedCircles(parsed);
      setTimeout(() => {
        butlerScrollRef.current?.scrollTo({ y: 260, animated: true });
      }, 200);
    } catch (err: any) {
      setSuggestedCircles([
        { dish: `${selectedCuisine} Saffron Specialty`, category: 'Fusion', icon: '🍲', role: 'Specialty 1' },
        { dish: 'Crispy Tahdig Base', category: 'Fusion', icon: '🍚', role: 'Specialty 2' },
        { dish: 'Persian Spiced Starter', category: 'Fusion', icon: '🥪', role: 'Specialty 3' },
        { dish: 'Citrus Herb Slaw', category: 'Fusion', icon: '🥗', role: 'Specialty 4' },
        { dish: 'Rosewater Sweet Finish', category: 'Fusion', icon: '🍨', role: 'Specialty 5' },
      ]);
    } finally {
      setButlerSuggestLoading(false);
    }
  };

  const handleSelectSuggestedDish = async (dishName: string, role: string) => {
    stopActiveSpeech();
    setSelectedButlerDish(dishName);
    setButlerRecipeLoading(true);
    setButlerRecipeText('');
    setParsedButlerRecipe(null);

    setTimeout(() => {
      butlerScrollRef.current?.scrollToEnd({ animated: true });
    }, 250);

    const guestLabel = guestCount.trim() || '4 (Family portion)';

    const prompt = `Provide the authentic recipe for "${dishName}" (${isFusionEnabled ? `Creative Persian-${selectedCuisine} Fusion` : 'Traditional Persian'}).
Scaled for: ${guestLabel}.
Language: ${lang === 'fa' ? 'Persian (Farsi)' : 'English'}.
Dietary notes: ${allergiesInput || 'None'}.
Calculate all macros STRICTLY PER 1 STANDARD SERVING and state its gram weight in [SERVING_SIZE].
Do not use asterisks (** or *).
Follow the required tags and 4-part skeleton:
[TEMPERAMENT]: (Warm / Cold / Balanced)
[SERVING_SIZE]: (e.g. 350 grams / ۳۵۰ گرم)
[PREP_TIME]: (minutes)
[COOK_TIME]: (minutes)
[CALORIES]: (kcal)
[PROTEIN]: (grams)
[FAT]: (grams)
[CARBS]: (grams)

[SECTION_1]: [طبع و تاریخچه / Nature & Temperament]
[SECTION_2]: [مواد لازم / Ingredients]
[SECTION_3]: [دستور پخت مرحله‌به‌مرحله / Step-by-Step Cooking]
[SECTION_4]: [فوت کوزه‌گری / Chef Secrets]`;

    try {
      const response = await askCulinaryHelper(prompt);
      const cleaned = cleanAsterisks(response);
      setButlerRecipeText(cleaned);
      setParsedButlerRecipe(parseRecipeMetadata(cleaned));
      setTimeout(() => {
        butlerScrollRef.current?.scrollToEnd({ animated: true });
      }, 300);
    } catch (e: any) {
      Alert.alert('Recipe Error', e.message);
    } finally {
      setButlerRecipeLoading(false);
    }
  };

  const handleTimeOfDayClick = () => {
    const foundCat = ALL_CATEGORIES.find((c) => c.id === timeMeal.catId) || ALL_CATEGORIES[0];
    const dish = lang === 'fa' ? timeMeal.dishFa : timeMeal.dishEn;
    setSelectedCategory(foundCat);
    handleSelectDish(dish, foundCat.titleEn, true);
  };

  const handleSaveToCookbook = (dishName: string, content: string) => {
    if (!content || !dishName) return;
    try {
      insertRecipe(
        dishName,
        isFusionEnabled ? `Fusion (${selectedCuisine})` : 'Persian Recipe',
        'Traditional',
        `Portion for ${guestCount || 'Family'}`,
        cleanAsterisks(content),
        'Authentic Technique Included'
      );
      refreshCookbook();
      Alert.alert(
        lang === 'fa' ? 'دستور ذخیره شد' : 'Recipe Saved',
        lang === 'fa' ? `دستور پخت "${dishName}" با موفقیت در کتابچه ذخیره گردید.` : `"${dishName}" is safely stored in your offline cookbook.`
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleExportPDF = async (dishTitle: string, content: string) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Unavailable', 'File sharing is not supported on this device.');
        return;
      }

      const isRtl = lang === 'fa';
      const cleanContent = cleanAsterisks(content);
      const htmlContent = `
        <!DOCTYPE html>
        <html dir="${isRtl ? 'rtl' : 'ltr'}">
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 30px; color: #1e293b; line-height: 1.6; text-align: ${isRtl ? 'right' : 'left'}; }
            .header { text-align: center; border-bottom: 3px double #c59b27; padding-bottom: 15px; margin-bottom: 25px; }
            .persian-title { font-size: 32px; color: #78350f; margin: 0; }
            .dish-name { font-size: 26px; color: #0c1b33; margin: 10px 0 5px 0; }
            .meta { font-size: 13px; color: #b45309; text-transform: uppercase; letter-spacing: 1px; }
            .recipe-body { white-space: pre-wrap; font-size: 15px; background: #faf8f5; border: 1px solid #e2d9cc; border-radius: 8px; padding: 20px; line-height: 1.8; }
            .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="persian-title">سفره ایرانی</div>
            <div class="dish-name">${dishTitle}</div>
            <div class="meta">Persian Masterclass Culinary Recipe</div>
          </div>
          <div class="recipe-body">${cleanContent}</div>
          <div class="footer">Exported from Persian Culinary App • Prepared with authentic traditions</div>
        </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });

      await Sharing.shareAsync(uri, {
        UTI: 'com.adobe.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Share ${dishTitle} Recipe`,
      });
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      if (!msg.includes('dismiss') && !msg.includes('cancel') && !msg.includes('abort')) {
        Alert.alert('Sharing Notice', 'Could not open share dialogue.');
      }
    }
  };

  const handleDeleteSaved = (id: number) => {
    try {
      deleteRecipeById(id);
      refreshCookbook();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const isRTL = lang === 'fa';

  const spinInterpolation = spinAnim.interpolate({
    inputRange: [0, 7],
    outputRange: ['0deg', '2520deg'],
  });

  return (
    <View style={[styles.rootContainer, { paddingTop: Math.max(insets.top, 14) }]}>
      <View style={[styles.outerFrame, styles.mainFrame]}>
        {/* HEADER */}
        <View style={styles.modernHeader}>
          <View>
            <Text style={styles.modernHeaderTitle}>سفره ایرانی</Text>
            <Text style={styles.modernHeaderSub}>
              {activeTab === 'home' && (lang === 'fa' ? 'سفره‌خانه سنتی و منوی رستورانی' : 'Royal Dining & Restaurant Menu')}
              {activeTab === 'search' && (lang === 'fa' ? 'جستجوی هوشمند غذاها' : 'Search Culinary Catalog')}
              {activeTab === 'wheel' && (lang === 'fa' ? 'گردونه سنتی سفره' : 'Concentric Persian Dial')}
              {activeTab === 'butler' && (lang === 'fa' ? 'میزبان درباری' : 'The Royal Dining Butler')}
              {activeTab === 'profile' && (lang === 'fa' ? 'پروفایل و کتابچه آشپزی' : 'My Kitchen & Profile')}
            </Text>
          </View>
          <View style={styles.langPillContainer}>
            <TouchableOpacity
              style={[styles.langPill, lang === 'en' && styles.langPillActive]}
              onPress={() => setLang('en')}
            >
              <Text style={[styles.langPillText, lang === 'en' && styles.langPillTextActive]}>English</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langPill, lang === 'fa' && styles.langPillActive]}
              onPress={() => setLang('fa')}
            >
              <Text style={[styles.langPillText, lang === 'fa' && styles.langPillTextActive]}>فارسی</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* SEARCH BAR (WHEN SEARCH TAB ACTIVE) */}
        {activeTab === 'search' && (
          <View style={styles.searchBarContainer}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              ref={searchInputRef}
              style={[styles.searchInput, isRTL && { textAlign: 'right' }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={lang === 'fa' ? 'جستجوی غذا یا خورشت (مثال: فسنجان، ته‌چین...)' : 'Search any recipe or stew (e.g. Fesenjan, Tahchin...)'}
              placeholderTextColor="#94a3b8"
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClearBtn}>
                <Text style={styles.searchClearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* TAB 1: HOME (RESTAURANT MENU BOOK STYLE WITH GOLD FRAMES) */}
        {activeTab === 'home' ? (
          <ScrollView style={{ flex: 1, width: '100%' }} contentContainerStyle={styles.homeScrollContent} showsVerticalScrollIndicator={false}>
            {/* Crown Hero Dish */}
            <TouchableOpacity style={styles.heroCard} activeOpacity={0.9} onPress={handleTimeOfDayClick}>
              <Text style={styles.heroEyebrow}>{lang === 'fa' ? timeMeal.labelFa : timeMeal.labelEn}</Text>
              <Text style={styles.heroTitle}>{lang === 'fa' ? timeMeal.dishFa : timeMeal.dishEn}</Text>
              <View style={styles.heroFooterRow}>
                <Text style={styles.heroIcon}>{timeMeal.icon}</Text>
                <View style={styles.heroCta}>
                  <Text style={styles.heroCtaText}>{lang === 'fa' ? 'دستور پخت ‹' : 'Cook this ‹'}</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Quick Action Navigation Buttons */}
            <View style={styles.quickRow}>
              <TouchableOpacity
                style={styles.quickCard}
                activeOpacity={0.85}
                onPress={() => {
                  setActiveTab('wheel');
                  setShowSurpriseModal(true);
                }}
              >
                <Text style={styles.quickIcon}>🎲</Text>
                <Text style={styles.quickTitle}>{lang === 'fa' ? 'چی بپزم؟ (شانس)' : 'Surprise Me'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickCard} activeOpacity={0.85} onPress={() => setShowRegionalModal(true)}>
                <Text style={styles.quickIcon}>📍</Text>
                <Text style={styles.quickTitle}>{lang === 'fa' ? 'غذاهای استانی' : 'Regional'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickCard} activeOpacity={0.85} onPress={() => setShowTemperamentInfo(true)}>
                <Text style={styles.quickIcon}>⚖️</Text>
                <Text style={styles.quickTitle}>{lang === 'fa' ? 'طبع و مزاج' : 'Temperament'}</Text>
              </TouchableOpacity>
            </View>

            {/* RESTAURANT MENU FOLIO BOOK */}
            <Text style={styles.menuBookMainHeading}>
              {lang === 'fa' ? '📖 منوی تشریفاتی رستوران' : '📖 Restaurant Menu Folio'}
            </Text>

            {COURSE_BUCKETS.filter((b) => b.id !== 'all').map((bucket) => {
              const bucketCategories = ALL_CATEGORIES.filter((c) => c.bucket === bucket.id);
              return (
                <View key={bucket.id} style={styles.menuFolioCard}>
                  {/* Gold Course Frame Header */}
                  <View style={styles.menuFolioHeaderRow}>
                    <Text style={styles.menuFolioIcon}>{bucket.icon}</Text>
                    <View style={{ flex: 1, paddingHorizontal: 8 }}>
                      <Text style={styles.menuFolioTitle}>
                        {lang === 'fa' ? bucket.titleFa : bucket.titleEn}
                      </Text>
                      <Text style={styles.menuFolioSubtitle}>
                        {lang === 'fa' ? bucket.subtitleFa : bucket.subtitleEn}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.menuFolioOpenDialBtn}
                      onPress={() => {
                        setSelectedBucket(bucket.id);
                        setActiveTab('wheel');
                      }}
                    >
                      <Text style={styles.menuFolioOpenDialText}>
                        {lang === 'fa' ? 'گردونه ‹' : 'Dial ‹'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.menuFolioGoldDivider} />

                  <View style={styles.menuFolioGrid}>
                    {bucketCategories.map((cat) => (
                      <View key={cat.id} style={styles.menuFolioCategoryBox}>
                        <TouchableOpacity
                          style={styles.menuFolioCategoryHeader}
                          activeOpacity={0.8}
                          onPress={() => {
                            setSelectedCategory(cat);
                            setSubModalMode('dial');
                          }}
                        >
                          <Text style={styles.menuFolioCatIcon}>{cat.icon}</Text>
                          <Text style={styles.menuFolioCatTitle}>
                            {(lang === 'fa' ? cat.titleFa : cat.titleEn).replace('\n', ' ')}
                          </Text>
                          <Text style={styles.menuFolioCatArrow}>›</Text>
                        </TouchableOpacity>

                        <View style={styles.menuFolioDishesPillsRow}>
                          {(lang === 'fa' ? cat.dishesFa : cat.dishesEn).slice(0, 3).map((dishName, dIdx) => (
                            <TouchableOpacity
                              key={dIdx}
                              style={styles.menuFolioDishPill}
                              onPress={() => {
                                setSelectedCategory(cat);
                                handleSelectDish(dishName, cat.titleEn, true);
                              }}
                            >
                              <Text style={styles.menuFolioDishPillText} numberOfLines={1}>
                                {dishName}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        ) : activeTab === 'wheel' ? (
          /* TAB 2: DIAL */
          <View style={{ flex: 1, width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ width: '100%', alignItems: 'center' }}>
              <View style={[styles.cornerLogoBadge, styles.centeredLogoBadge, { width: dial.badgeW * 1.3, height: dial.badgeH * 1.1 }]}>
                <Image
                  source={require('./assets/moghimi_logo.jpg')}
                  style={styles.cornerLogoImage}
                  resizeMode="contain"
                />
              </View>

              {/* Gold Course Bucket Selector */}
              <View style={styles.courseBucketBarWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.courseBucketScroll}>
                  {COURSE_BUCKETS.map((b) => {
                    const isActive = selectedBucket === b.id;
                    return (
                      <TouchableOpacity
                        key={b.id}
                        style={[styles.courseBucketPill, isActive && styles.courseBucketPillActive]}
                        onPress={() => setSelectedBucket(b.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.courseBucketIcon}>{b.icon}</Text>
                        <Text style={[styles.courseBucketText, isActive && styles.courseBucketTextActive]}>
                          {lang === 'fa' ? b.titleFa : b.titleEn}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* Rotating Wheel Viewport */}
            <View style={[styles.dialViewport, { width: dial.size, height: dial.size }, { marginVertical: 2, alignSelf: 'center' }]}>
              <Animated.View style={[styles.dialContainer, { width: dial.size, height: dial.size }, { transform: [{ rotate: spinInterpolation }] }]}>
                <ImageBackground
                  source={require('./assets/persian_wheel.jpg')}
                  style={[styles.wheelBackground, { width: dial.size, height: dial.size }]}
                  imageStyle={[styles.wheelImageStyle, { borderRadius: dial.size / 2 }]}
                >
                  <View style={[styles.centerMedallionContainer, circleBox(dial.medallion)]}>
                    <Image
                      source={require('./assets/iran_map.jpg')}
                      style={styles.centerMedallionImage}
                      resizeMode="cover"
                    />
                  </View>

                  {/* Adaptive Category Circles */}
                  {displayedCategories.map((cat, index) => {
                    const total = displayedCategories.length;
                    const stepAngle = 360 / total;
                    const angle = (index * stepAngle - 90) * (Math.PI / 180);
                    const isMagnified = magnifiedId === cat.id;
                    const isSpinLightActive = isSpinning && spinLightIndex === index;

                    const circleDiameter = total <= 4 ? 76 : total <= 7 ? 68 : 50;
                    const ringRadius = dial.size / 2 - (total <= 7 ? 42 : 34);

                    const x = dial.center + ringRadius * Math.cos(angle) - circleDiameter / 2;
                    const y = dial.center + ringRadius * Math.sin(angle) - circleDiameter / 2;

                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.bucketCircle,
                          {
                            left: x,
                            top: y,
                            width: circleDiameter,
                            height: circleDiameter,
                            borderRadius: circleDiameter / 2,
                          },
                          isMagnified && styles.circleMagnifiedLarge,
                          isSpinLightActive && styles.circleSpinLightGlowing,
                        ]}
                        activeOpacity={0.9}
                        delayLongPress={200}
                        onPressIn={() => !isSpinning && setMagnifiedId(cat.id)}
                        onPressOut={() => setMagnifiedId(null)}
                        onPress={() => {
                          if (isSpinning) return;
                          setMagnifiedId(null);
                          setSelectedCategory(cat);
                          setSubModalMode('dial');
                        }}
                      >
                        <Text style={[styles.bucketCircleIcon, { fontSize: total <= 7 ? 20 : 15 }]}>
                          {isSpinLightActive ? '✨' : cat.icon}
                        </Text>
                        <Text
                          style={[
                            styles.bucketCircleLabel,
                            { fontSize: total <= 4 ? 11 : total <= 7 ? 9.5 : 7.5 },
                            isMagnified && styles.labelMagnified,
                          ]}
                          numberOfLines={2}
                        >
                          {lang === 'fa' ? cat.titleFa : cat.titleEn}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ImageBackground>
              </Animated.View>
            </View>

            {/* Bottom Action Area: Compact "Surprise Me" Button */}
            <View style={{ width: '100%', alignItems: 'center', marginBottom: 4 }}>
              <View style={styles.wheelBottomActionRow}>
                <TouchableOpacity
                  style={[styles.compactSurpriseBtn, isSpinning && styles.compactSurpriseBtnSpinning]}
                  onPress={() => setShowSurpriseModal(true)}
                  disabled={isSpinning}
                  activeOpacity={0.85}
                >
                  <Text style={styles.compactSurpriseIcon}>{isSpinning ? '⏳' : '🎲'}</Text>
                  <Text style={styles.compactSurpriseText}>
                    {isSpinning
                      ? (lang === 'fa' ? 'در حال چرخش...' : 'Spinning...')
                      : (lang === 'fa' ? 'پیشنهاد تصادفی (چی بپزم؟)' : 'Surprise Me')}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.bottomGuidePill} onPress={() => setShowUserGuide(true)} activeOpacity={0.85}>
                <Text style={styles.bottomGuideIcon}>📘</Text>
                <Text style={styles.bottomGuideText}>
                  {lang === 'fa' ? 'راهنمای استفاده و امکانات' : 'User Guide & Features'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : activeTab === 'search' ? (
          /* TAB 3: SEARCH */
          <View style={styles.searchResultsWrapper}>
            <View style={styles.searchResultsHeaderRow}>
              <Text style={styles.searchResultsCountText}>
                {searchQuery.trim().length === 0
                  ? (lang === 'fa' ? 'نام غذا یا خورشت را بنویسید' : 'Type a dish or stew name to begin')
                  : lang === 'fa'
                  ? `${filteredSearchResults.length} نتیجه برای «${searchQuery}»:`
                  : `${filteredSearchResults.length} matches found:`}
              </Text>
            </View>
            <ScrollView style={styles.searchResultsScroll} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
              {searchQuery.trim().length === 0 ? null : filteredSearchResults.length === 0 ? (
                <View style={styles.searchEmptyBox}>
                  <Text style={styles.searchEmptyText}>
                    {lang === 'fa'
                      ? 'غذایی با این نام یافت نشد. می‌توانید از میزبان درباری بخواهید آن را آماده کند.'
                      : 'No exact matches found. You can ask the Royal Butler to prepare it.'}
                  </Text>
                </View>
              ) : (
                filteredSearchResults.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.searchResultCard}
                    activeOpacity={0.8}
                    onPress={() => {
                      setSearchQuery('');
                      setSelectedCategory(item.category);
                      const titleToUse = lang === 'fa' ? item.dishFa : item.dishEn;
                      handleSelectDish(titleToUse, item.category.titleEn, true);
                    }}
                  >
                    <Text style={styles.searchResultIcon}>{item.icon}</Text>
                    <View style={{ flex: 1, paddingHorizontal: 8 }}>
                      <Text style={styles.searchResultTitle}>{lang === 'fa' ? item.dishFa : item.dishEn}</Text>
                      <Text style={styles.searchResultSub}>{lang === 'fa' ? item.categoryFa : item.categoryEn}</Text>
                    </View>
                    <View style={styles.searchResultCookBadge}>
                      <Text style={styles.searchResultCookText}>{lang === 'fa' ? 'دستور پخت ‹' : 'Cook ‹'}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        ) : activeTab === 'profile' ? (
          /* TAB 5: PROFILE */
          <ScrollView style={{ flex: 1, width: '100%' }} contentContainerStyle={styles.homeScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.profileHeader}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>👨‍🍳</Text>
              </View>
              <Text style={styles.profileName}>{lang === 'fa' ? 'سرآشپز من' : 'My Kitchen'}</Text>
              <Text style={styles.profileStat}>
                {savedRecipes.length} {lang === 'fa' ? 'دستور ذخیره‌شده' : 'saved recipes'}
              </Text>
            </View>

            <TouchableOpacity style={styles.profileRow} activeOpacity={0.85} onPress={() => setShowCookbook(true)}>
              <Text style={styles.profileRowIcon}>📖</Text>
              <Text style={styles.profileRowText}>{lang === 'fa' ? 'دستورهای ذخیره‌شده' : 'Saved Recipes'}</Text>
              <Text style={styles.profileRowChevron}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileRow} activeOpacity={0.85} onPress={() => setShowSettings(true)}>
              <Text style={styles.profileRowIcon}>⚙️</Text>
              <Text style={styles.profileRowText}>{lang === 'fa' ? 'تنظیمات' : 'Settings'}</Text>
              <Text style={styles.profileRowChevron}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileRow} activeOpacity={0.85} onPress={() => setShowUserGuide(true)}>
              <Text style={styles.profileRowIcon}>📘</Text>
              <Text style={styles.profileRowText}>{lang === 'fa' ? 'راهنمای استفاده و امکانات' : 'User Guide & Features'}</Text>
              <Text style={styles.profileRowChevron}>›</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}
      </View>

      {/* BOTTOM TAB BAR */}
      <View
        style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}
        onLayout={(e) => setTabBarHeight(e.nativeEvent.layout.height)}
      >
        {([
          { key: 'home', icon: '🏠', en: 'Home', fa: 'خانه' },
          { key: 'search', icon: '🔍', en: 'Search', fa: 'جستجو' },
          { key: 'wheel', icon: '☸️', en: 'Dial', fa: 'گردونه' },
          { key: 'butler', icon: '🤵', en: 'Butler', fa: 'میزبان' },
          { key: 'profile', icon: '👤', en: 'Profile', fa: 'پروفایل' },
        ] as const).map((tab) => {
          const isCenter = tab.key === 'wheel';
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              activeOpacity={0.8}
              onPress={() => {
                if (tab.key === 'search' && activeTab === 'search') {
                  searchInputRef.current?.focus();
                  return;
                }
                if (activeTab === 'butler' && tab.key !== 'butler') stopActiveSpeech();
                Keyboard.dismiss();
                setActiveTab(tab.key);
              }}
            >
              {isCenter ? (
                <View style={[styles.tabCenterButton, isActive && styles.tabCenterButtonActive]}>
                  <Text style={styles.tabCenterIcon}>{tab.icon}</Text>
                </View>
              ) : (
                <View style={[styles.tabIconPill, isActive && styles.tabIconPillActive]}>
                  <Text style={[styles.tabIcon, !isActive && styles.tabIconInactive]}>{tab.icon}</Text>
                </View>
              )}
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{lang === 'fa' ? tab.fa : tab.en}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* SURPRISE ME COURSE SELECTION MODAL (FOREGROUND SELECTION OVER BACKGROUND WHEEL) */}
      <Modal visible={showSurpriseModal} animationType="fade" transparent={true} onRequestClose={() => setShowSurpriseModal(false)}>
        <View style={styles.surpriseOverlay}>
          <View style={styles.surpriseCourseCard}>
            <View style={styles.surpriseCourseHeader}>
              <Text style={{ fontSize: 26 }}>🎲</Text>
              <View style={{ flex: 1, paddingHorizontal: 10 }}>
                <Text style={styles.surpriseCourseTitle}>{lang === 'fa' ? 'انتخاب دوره غذایی برای شانس' : 'Select Course to Spin'}</Text>
                <Text style={styles.surpriseCourseSubtitle}>{lang === 'fa' ? 'برای کدام وعده شانس گردونه را امتحان می‌کنید؟' : 'Which course should the wheel pick from?'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSurpriseModal(false)} style={styles.closeBadge}>
                <Text style={styles.closeBadgeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.surprisePillList}>
              {COURSE_BUCKETS.map((course) => (
                <TouchableOpacity
                  key={course.id}
                  style={styles.surpriseCourseButton}
                  onPress={() => triggerWheelSpinForCourse(course.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.surpriseCourseBtnIcon}>{course.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.surpriseCourseBtnText}>{lang === 'fa' ? course.titleFa : course.titleEn}</Text>
                    <Text style={styles.surpriseCourseBtnSub}>{lang === 'fa' ? course.subtitleFa : course.subtitleEn}</Text>
                  </View>
                  <Text style={styles.surpriseCourseBtnArrow}>‹</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* POST-SPIN CONFIRMATION MODAL (ASK YES / NO) */}
      <Modal visible={spinResultDish !== null} animationType="fade" transparent={true} onRequestClose={() => setSpinResultDish(null)}>
        <View style={styles.surpriseOverlay}>
          <View style={styles.spinConfirmationCard}>
            <Text style={styles.spinConfirmationIcon}>✨🍲✨</Text>
            <Text style={styles.spinConfirmationHeading}>{lang === 'fa' ? 'گردونه این غذا را پیشنهاد داد:' : 'The Wheel Landed On:'}</Text>
            <Text style={styles.spinConfirmationDish}>{spinResultDish?.dish}</Text>
            <Text style={styles.spinConfirmationCategory}>
              {lang === 'fa' ? `از دسته ${spinResultDish?.category.titleFa}` : `Category: ${spinResultDish?.category.titleEn}`}
            </Text>

            <Text style={styles.spinConfirmationQuestion}>
              {lang === 'fa' ? 'آیا مایلید دستور پخت این غذا آماده شود؟' : 'Would you like to prepare this recipe?'}
            </Text>

            <View style={styles.spinConfirmationButtonRow}>
              <TouchableOpacity
                style={styles.spinConfirmNoBtn}
                onPress={() => {
                  setSpinResultDish(null);
                  setShowSurpriseModal(true);
                }}
              >
                <Text style={styles.spinConfirmNoText}>{lang === 'fa' ? 'خیر، چرخش دوباره' : 'No, Spin Again'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.spinConfirmYesBtn}
                onPress={() => {
                  if (spinResultDish) {
                    const dishToCook = spinResultDish.dish;
                    const catToCook = spinResultDish.category;
                    setSpinResultDish(null);
                    setSelectedCategory(catToCook);
                    handleSelectDish(dishToCook, catToCook.titleEn, true);
                  }
                }}
              >
                <Text style={styles.spinConfirmYesText}>{lang === 'fa' ? 'بله، پخت این غذا' : 'Yes, Cook This!'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* BUTLER TAB CONTENT */}
      {activeTab === 'butler' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.butlerTabContainer, { paddingTop: Math.max(insets.top, 18) + 4, bottom: tabBarHeight + TAB_CENTER_OVERHANG }]}
        >
          <View style={[styles.butlerCard, styles.butlerCardTab]}>
            <View style={styles.heritageHeaderRow}>
              <Text style={styles.heritageIconLarge}>🤵</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.heritageModalTitle}>
                  {lang === 'fa' ? 'میزبان درباری (Persian Butler)' : 'Persian Dining Butler (میزبان)'}
                </Text>
                <Text style={styles.heritageModalPersian}>
                  {selectedBucket === 'all'
                    ? (lang === 'fa' ? 'طراحی متناسب ضیافت بر اساس تعداد نفرات و رژیم غذایی' : 'Banquet curation & dietary tailoring')
                    : (lang === 'fa' ? `طراحی متمرکز بر دسته: ${COURSE_BUCKETS.find((b) => b.id === selectedBucket)?.titleFa}` : `Focused on Course: ${COURSE_BUCKETS.find((b) => b.id === selectedBucket)?.titleEn}`)}
                </Text>
              </View>

              <View style={styles.fusionSwitchContainer}>
                <Text style={styles.fusionSwitchLabel}>
                  {lang === 'fa' ? 'فیوژن' : 'Fusion'}
                </Text>
                <Switch
                  value={isFusionEnabled}
                  onValueChange={(val) => {
                    setIsFusionEnabled(val);
                    if (val) {
                      Alert.alert(
                        lang === 'fa' ? 'حالت فیوژن فعال شد' : 'Fusion Mode Activated',
                        lang === 'fa' 
                          ? 'کشور مورد نظر خود را انتخاب فرمایید تا منوی ترکیبی ویژه آماده گردد.'
                          : 'Select your desired culture to tailor an innovative fusion banquet.'
                      );
                    }
                  }}
                  trackColor={{ false: '#334155', true: '#c59b27' }}
                  thumbColor={isFusionEnabled ? '#f6d860' : '#94a3b8'}
                />
              </View>
            </View>

            <View style={styles.butlerBucketIndicator}>
              <Text style={styles.butlerBucketIndicatorText}>
                {lang === 'fa'
                  ? `منوی فعال: ${COURSE_BUCKETS.find((b) => b.id === selectedBucket)?.titleFa}`
                  : `Active Course: ${COURSE_BUCKETS.find((b) => b.id === selectedBucket)?.titleEn}`}
              </Text>
            </View>

            <ScrollView ref={butlerScrollRef} style={{ flex: 1, marginVertical: 6 }} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
              {isFusionEnabled && (
                <View style={styles.cuisineSelectorCard}>
                  <Text style={styles.cuisineSelectorHeading}>
                    {lang === 'fa' ? 'کشور مقصد جهت ترکیب با سبک اصیل ایرانی:' : 'Select Target Fusion Cuisine:'}
                  </Text>
                  <View style={styles.cuisinePillsRow}>
                    {(['American', 'Japanese', 'Chinese', 'Mexican'] as FusionCuisine[]).map((c) => {
                      const active = selectedCuisine === c;
                      const icons: Record<FusionCuisine, string> = {
                        American: '🇺🇸 American',
                        Japanese: '🇯🇵 Japanese',
                        Chinese: '🇨🇳 Chinese',
                        Mexican: '🇲🇽 Mexican',
                      };
                      const iconsFa: Record<FusionCuisine, string> = {
                        American: '🇺🇸 آمریکایی',
                        Japanese: '🇯🇵 ژاپنی',
                        Chinese: '🇨🇳 چینی',
                        Mexican: '🇲🇽 مکزیکی',
                      };
                      return (
                        <TouchableOpacity
                          key={c}
                          style={[styles.cuisinePill, active && styles.cuisinePillActive]}
                          onPress={() => setSelectedCuisine(c)}
                        >
                          <Text style={[styles.cuisinePillText, active && styles.cuisinePillTextActive]}>
                            {lang === 'fa' ? iconsFa[c] : icons[c]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              <Text style={styles.butlerQuestionLabel}>{lang === 'fa' ? 'چند نفر مهمان دارید؟' : 'How many guests will be dining?'}</Text>
              <TextInput
                style={[styles.butlerInput, isRTL && { textAlign: 'right' }]}
                keyboardType="numeric"
                value={guestCount}
                onChangeText={setGuestCount}
                placeholder="e.g. 4, 8, 12"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.butlerQuestionLabel}>{lang === 'fa' ? 'آیا حساسیت غذایی یا رژیم خاصی دارید؟' : 'Any food allergies or dietary restrictions?'}</Text>
              <TextInput
                style={[styles.butlerInput, isRTL && { textAlign: 'right' }]}
                value={allergiesInput}
                onChangeText={setAllergiesInput}
                placeholder={lang === 'fa' ? 'مثال: بدون گردو، بدون گلوتن، گیاهی، کم‌نمک' : 'e.g. Walnut allergy, Gluten-free, Vegetarian, Low sodium'}
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.butlerQuestionLabel}>{lang === 'fa' ? 'طعم یا ذائقه خاصی مد نظر دارید؟' : 'Flavor preferences or special requests?'}</Text>
              <TextInput
                style={[styles.butlerInput, isRTL && { textAlign: 'right' }]}
                value={specialPreferences}
                onChangeText={setSpecialPreferences}
                placeholder={lang === 'fa' ? 'مثال: پر زعفران، ترش با رب انار، ته‌دیگ ترد' : 'e.g. Extra saffron, sour pomegranate focus, crispy Tahdig'}
                placeholderTextColor="#94a3b8"
              />

              <TouchableOpacity style={styles.butlerSubmitBtn} onPress={handleConsultButler} disabled={butlerSuggestLoading}>
                <Text style={styles.butlerSubmitBtnText}>
                  {butlerSuggestLoading 
                    ? (lang === 'fa' ? 'در حال چینش ضیافت...' : 'Curating Menu & Proportions...') 
                    : isFusionEnabled
                      ? (lang === 'fa' ? `✨ طراحی ضیافت فیوژن ایرانی-${selectedCuisine}` : `✨ Curate Persian-${selectedCuisine} Fusion`)
                      : (lang === 'fa' ? 'طراحی منوی متناسب ضیافت' : 'Curate My Banquet Menu')}
                </Text>
              </TouchableOpacity>

              {butlerSuggestLoading && (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#f6d860" />
                </View>
              )}

              {suggestedCircles.length > 0 && (
                <View style={styles.suggestedContainer}>
                  <Text style={styles.suggestedTitle}>
                    {isFusionEnabled
                      ? (lang === 'fa' ? `✨ منوی فیوژن ایرانی-${selectedCuisine}:` : `✨ Persian-${selectedCuisine} Fusion Menu:`)
                      : (lang === 'fa' ? 'پیشنهاد هماهنگ میزبان برای ضیافت:' : "Butler's Suggested Course Harmony:")}
                  </Text>
                  <Text style={styles.suggestedSubtext}>
                    {lang === 'fa' ? 'جهت مشاهده مقادیر و دستور پخت کامل، هر دایره را لمس فرمایید:' : 'Tap any circular course to review its scaled recipe:'}
                  </Text>

                  <View style={styles.suggestedCirclesGrid}>
                    {suggestedCircles.map((item) => {
                      const isSelected = selectedButlerDish === item.dish;
                      return (
                        <TouchableOpacity
                          key={item.dish}
                          style={[styles.suggestedDishCircle, isSelected && styles.suggestedDishCircleActive]}
                          onPress={() => handleSelectSuggestedDish(item.dish, item.role)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.suggestedDishIcon}>{item.icon}</Text>
                          <Text style={[styles.suggestedDishName, isSelected && styles.suggestedDishNameActive]} numberOfLines={2}>
                            {item.dish}
                          </Text>
                          <Text style={styles.suggestedDishRole}>{item.role}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {butlerRecipeLoading && (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#f6d860" />
                  <Text style={{ color: '#f6d860', fontSize: 13, marginTop: 8, fontWeight: '700' }}>
                    {lang === 'fa' ? 'در حال نگارش دستور پخت، زمان‌ها و فوت کوزه‌گری...' : 'Generating recipe instructions & secrets...'}
                  </Text>
                </View>
              )}

              {parsedButlerRecipe && !butlerRecipeLoading && (
                <View style={styles.butlerResponseBox}>
                  <View style={styles.recipeTitleRow}>
                    <Text style={styles.butlerResponseTitle}>{selectedButlerDish}</Text>
                    <View style={styles.actionButtonRow}>
                      <TouchableOpacity style={styles.shareBtn} onPress={() => handleExportPDF(selectedButlerDish || 'Banquet Recipe', butlerRecipeText)}>
                        <Text style={styles.shareBtnText}>📄 PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.saveRecipeBtn} onPress={() => handleSaveToCookbook(selectedButlerDish || 'Banquet Recipe', butlerRecipeText)}>
                        <Text style={styles.saveRecipeBtnText}>💾 {lang === 'fa' ? 'ذخیره دستور' : 'Save Recipe'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <RecipeTabbedDisplay
                    parsed={parsedButlerRecipe}
                    lang={lang}
                    isSpeaking={isSpeaking}
                    speakingSection={speakingSection}
                    currentStepIndex={currentStepIndex}
                    onSpeakSection={(secKey, text) => speakSanitizedText(text, secKey)}
                    onStopSpeech={stopActiveSpeech}
                    onReadStep={(idx) => handleReadStep(idx, parsedButlerRecipe)}
                    onShowTemperament={() => setShowTemperamentInfo(true)}
                  />
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* REGIONAL CUISINE MODAL */}
      <Modal visible={showRegionalModal} animationType="slide" transparent={true} onRequestClose={() => setShowRegionalModal(false)}>
        <View style={styles.heritageModalOverlay}>
          <View style={styles.regionalCard}>
            <View style={styles.heritageHeaderRow}>
              <Text style={{ fontSize: 28 }}>📍</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.heritageModalTitle}>
                  {lang === 'fa' ? 'خوراک‌های اصیل استانی و بومی ایران' : 'Authentic Regional Iranian Cuisines'}
                </Text>
                <Text style={styles.heritageModalPersian}>Local Specialities by Province & Geography</Text>
              </View>
              <TouchableOpacity onPress={() => setShowRegionalModal(false)} style={styles.closeBadge}>
                <Text style={styles.closeBadgeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 480, marginVertical: 10 }} showsVerticalScrollIndicator={true}>
              {REGIONAL_PROVINCES.map((prov) => (
                <View key={prov.id} style={styles.regionalProvinceCard}>
                  <Text style={styles.regionalProvinceTitle}>
                    {prov.icon} {lang === 'fa' ? prov.nameFa : prov.nameEn}
                  </Text>
                  <Text style={[styles.regionalProvinceDesc, isRTL && styles.textRTL]}>
                    {lang === 'fa' ? prov.descriptionFa : prov.descriptionEn}
                  </Text>

                  <View style={styles.regionalPillsContainer}>
                    {(lang === 'fa' ? prov.specialtiesFa : prov.specialtiesEn).map((dishName, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.regionalDishPill}
                        onPress={() => {
                          setShowRegionalModal(false);
                          const foundCat = ALL_CATEGORIES[0];
                          setSelectedCategory(foundCat);
                          handleSelectDish(dishName, prov.nameEn, true);
                        }}
                      >
                        <Text style={styles.regionalDishPillText}>{dishName}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.heritageDismissBtn} onPress={() => setShowRegionalModal(false)}>
              <Text style={styles.heritageDismissBtnText}>{lang === 'fa' ? 'بازگشت به سفره' : 'Return to Wheel'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* USER GUIDE MODAL WITH EMBEDDED LOGO */}
      <Modal visible={showUserGuide} animationType="slide" transparent={true} onRequestClose={() => setShowUserGuide(false)}>
        <View style={styles.heritageModalOverlay}>
          <View style={styles.userGuideCard}>
            <View style={styles.heritageHeaderRow}>
              <Text style={{ fontSize: 28 }}>📘</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.heritageModalTitle}>
                  {lang === 'fa' ? 'راهنمای کاربری و امکانات برنامه' : 'Persian Culinary User Guide'}
                </Text>
                <Text style={styles.heritageModalPersian}>Features, Audio, Butler & Nutrition</Text>
              </View>
              <TouchableOpacity onPress={() => setShowUserGuide(false)} style={styles.closeBadge}>
                <Text style={styles.closeBadgeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 460, marginVertical: 10 }} showsVerticalScrollIndicator={true}>
              <View style={styles.guideSectionBox}>
                <Text style={styles.guideSectionTitle}>1. 👑 {lang === 'fa' ? 'منوی رستورانی در صفحه اصلی' : 'Restaurant Folio on Home'}</Text>
                <Text style={[styles.guideSectionText, isRTL && styles.textRTL]}>
                  {lang === 'fa'
                    ? 'در تب خانه، تمام غذاها بر اساس دوره‌های رستورانی (پیش‌غذا، غذای اصلی، مخلفات، دسر، ساندویچ و نوشیدنی) در کادرهای زرین مجلل ارائه شده‌اند.'
                    : 'The Home tab organizes dishes into royal gold-bordered banquet folio courses (Appetizers, Mains, Sides, Desserts, Snacks, Drinks).'}
                </Text>
              </View>

              <View style={styles.guideSectionBox}>
                <Text style={styles.guideSectionTitle}>2. 🎲 {lang === 'fa' ? 'پیشنهاد تصادفی (چی بپزم؟)' : 'Surprise Me Flow'}</Text>
                <Text style={[styles.guideSectionText, isRTL && styles.textRTL]}>
                  {lang === 'fa'
                    ? 'ابتدا دوره غذایی مد نظر را انتخاب می‌کنید، سپس گردونه می‌چرخد و پس از توقف، نام غذا را نمایش داده و نظر شما را برای تهیه دستور می‌پرسد.'
                    : 'Select a course, watch the wheel spin, and decide whether you want the recipe or prefer to spin again.'}
                </Text>
              </View>

              <View style={styles.guideSectionBox}>
                <Text style={styles.guideSectionTitle}>3. 📑 {lang === 'fa' ? 'تب‌بندی بخش‌های دستور پخت' : 'Segmented Recipe Tabs'}</Text>
                <Text style={[styles.guideSectionText, isRTL && styles.textRTL]}>
                  {lang === 'fa'
                    ? 'هر دستور پخت در ۴ تب مجزا (طبع، مواد لازم، مراحل پخت، فوت کوزه‌گری) ارائه می‌شود تا دقیقاً بخش دلخواه را با دستیار صوتی مرور فرمایید.'
                    : 'Recipes open into 4 dedicated tabs (Nature, Ingredients, Steps, Secrets) allowing seamless switching and focused audio guidance.'}
                </Text>
              </View>

              <View style={styles.savedCardGoldLine} />

              <View style={styles.logoContainer}>
                <Image
                  source={require('./assets/moghimi_logo.jpg')}
                  style={styles.moghimiLogo}
                  resizeMode="contain"
                />
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.heritageDismissBtn} onPress={() => setShowUserGuide(false)}>
              <Text style={styles.heritageDismissBtnText}>{lang === 'fa' ? 'متوجه شدم' : 'Understood'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SUBCATEGORY DIAL & TABBED RECIPE MODAL */}
      <Modal
        visible={selectedCategory !== null}
        animationType="fade"
        onRequestClose={() => {
          stopActiveSpeech();
          if (isHomeSurpriseActive || subModalMode === 'dial') {
            setSelectedCategory(null);
            setActiveDish(null);
            setIsHomeSurpriseActive(false);
          } else {
            setSubModalMode('dial');
          }
        }}
      >
        <View style={[styles.rootContainer, { paddingTop: Math.max(insets.top, 14), paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.outerFrame}>
            {subModalMode === 'dial' ? (
              <View style={{ flex: 1, width: '100%', justifyContent: 'space-between' }}>
                <View style={styles.header}>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedCategory(null);
                      setActiveDish(null);
                    }}
                    style={[styles.backButton, { width: dial.headerSideW }]}
                  >
                    <Text style={styles.backButtonText}>‹ {lang === 'fa' ? 'صفحه اصلی' : 'Home'}</Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.headerTitle}>{selectedCategory?.persian}</Text>
                    <Text style={styles.headerSub}>
                      {lang === 'fa' ? selectedCategory?.titleFa : selectedCategory?.titleEn.replace('\n', ' ')}
                    </Text>
                  </View>
                  <View style={{ width: dial.headerSideW }} />
                </View>

                <View style={[styles.dialViewport, { width: dial.size, height: dial.size }, { marginTop: 20, alignSelf: 'center' }]}>
                  <View style={[styles.dialContainer, { width: dial.size, height: dial.size }]}>
                    <ImageBackground
                      source={require('./assets/persian_wheel.jpg')}
                      style={[styles.wheelBackground, { width: dial.size, height: dial.size }]}
                      imageStyle={[styles.wheelImageStyle, { borderRadius: dial.size / 2 }]}
                    >
                      <View style={[styles.centerMedallionContainer, circleBox(dial.medallion)]}>
                        <Image
                          source={require('./assets/iran_map.jpg')}
                          style={styles.centerMedallionImage}
                          resizeMode="cover"
                        />
                      </View>

                      {(lang === 'fa' ? selectedCategory?.dishesFa : selectedCategory?.dishesEn)?.map((dish, index) => {
                        const total = selectedCategory.dishesEn.length;
                        const stepAngle = 360 / total;
                        const angle = (index * stepAngle - 90) * (Math.PI / 180);
                        const subRadius = dial.subRadius;
                        const isDishMagnified = magnifiedId === dish;
                        const circleSize = dial.subDiameter;
                        const x = dial.center + subRadius * Math.cos(angle) - circleSize / 2;
                        const y = dial.center + subRadius * Math.sin(angle) - circleSize / 2;

                        return (
                          <TouchableOpacity
                            key={dish}
                            style={[
                              styles.subDishCircle,
                              circleBox(circleSize),
                              { left: x, top: y },
                              isDishMagnified && styles.subDishMagnified,
                            ]}
                            activeOpacity={0.9}
                            delayLongPress={200}
                            onPressIn={() => setMagnifiedId(dish)}
                            onPressOut={() => setMagnifiedId(null)}
                            onPress={() => {
                              setMagnifiedId(null);
                              handleSelectDish(dish, selectedCategory.titleEn, false);
                            }}
                          >
                            <Text style={[styles.subDishIcon, isDishMagnified && { fontSize: 22 }]}>
                              {selectedCategory.icon}
                            </Text>
                            <Text
                              style={[styles.subDishLabel, isDishMagnified && styles.subDishLabelMagnified]}
                              numberOfLines={isDishMagnified ? 3 : 2}
                            >
                              {dish}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ImageBackground>
                  </View>
                </View>

                <Text style={styles.footerInstruction}>
                  {lang === 'fa'
                    ? 'برای خواندن نام غذا انگشت را نگه‌دارید • برای دریافت دستور پخت ضربه بزنید'
                    : 'Hold finger to magnify text • Tap to generate recipe'}
                </Text>
              </View>
            ) : (
              <View style={{ flex: 1, width: '100%' }}>
                <View style={styles.header}>
                  <TouchableOpacity
                    onPress={() => {
                      stopActiveSpeech();
                      if (isHomeSurpriseActive) {
                        setSelectedCategory(null);
                        setActiveDish(null);
                        setIsHomeSurpriseActive(false);
                      } else {
                        setSubModalMode('dial');
                      }
                    }}
                    style={styles.backButton}
                  >
                    <Text style={styles.backButtonText}>
                      ‹ {isHomeSurpriseActive ? (lang === 'fa' ? 'صفحه اصلی' : 'Home') : (lang === 'fa' ? 'منو' : 'Menu')}
                    </Text>
                  </TouchableOpacity>
                  <View style={{ alignItems: 'center', flex: 1, paddingHorizontal: 4 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{activeDish}</Text>
                    <Text style={styles.headerSub}>{lang === 'fa' ? 'دستور پخت اصیل ایرانی' : 'Authentic Persian Recipe'}</Text>
                  </View>
                  {!loading && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity style={styles.shareBtn} onPress={() => handleExportPDF(activeDish || 'Persian Recipe', recipeContent)}>
                        <Text style={styles.shareBtnText}>📄 PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.saveRecipeBtn} onPress={() => handleSaveToCookbook(activeDish || 'Persian Recipe', recipeContent)}>
                        <Text style={styles.saveRecipeBtnText}>💾 {lang === 'fa' ? 'ذخیره دستور' : 'Save Recipe'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <ScrollView style={styles.fullScreenRecipeScroll} contentContainerStyle={styles.fullScreenRecipeContent}>
                  {loading ? (
                    <View style={styles.centerBoxLarge}>
                      <ActivityIndicator size="large" color="#f6d860" />
                      <Text style={styles.loadingHourglassIcon}>⏳</Text>
                      <Text style={styles.loadingTextLarge}>
                        {lang === 'fa'
                          ? 'در حال آماده‌سازی تب‌ها، مقادیر و فوت کوزه‌گری...'
                          : 'Preparing recipe tabs, ingredients & chef secrets...'}
                      </Text>
                    </View>
                  ) : parsedRecipe ? (
                    <RecipeTabbedDisplay
                      parsed={parsedRecipe}
                      lang={lang}
                      isSpeaking={isSpeaking}
                      speakingSection={speakingSection}
                      currentStepIndex={currentStepIndex}
                      onSpeakSection={(secKey, text) => speakSanitizedText(text, secKey)}
                      onStopSpeech={stopActiveSpeech}
                      onReadStep={(idx) => handleReadStep(idx, parsedRecipe)}
                      onShowTemperament={() => setShowTemperamentInfo(true)}
                    />
                  ) : null}
                </ScrollView>
              </View>
            )}

            {showTemperamentInfo && (
              <View style={styles.inPlaceModalOverlay}>
                <View style={styles.temperamentCard}>
                  <View style={styles.heritageHeaderRow}>
                    <Text style={{ fontSize: 26 }}>⚖️</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.heritageModalTitle}>
                        {lang === 'fa' ? 'طبع‌شناسی و مصلحات غذایی' : 'Temperament Balance & Mosleh'}
                      </Text>
                      <Text style={styles.heritageModalPersian}>Traditional Hot/Cold Nutritional Harmony</Text>
                    </View>
                    <TouchableOpacity onPress={() => setShowTemperamentInfo(false)} style={styles.closeBadge}>
                      <Text style={styles.closeBadgeText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={{ marginVertical: 8 }}>
                    <View style={styles.temperamentGuideRow}>
                      <Text style={[styles.temperamentTagBadge, { backgroundColor: '#431407', borderColor: '#f97316', color: '#fdba74' }]}>
                        🔥 {lang === 'fa' ? 'طبع گرم (Garmi)' : 'Warm Nature'}
                      </Text>
                      <Text style={[styles.temperamentGuideDesc, isRTL && styles.textRTL]}>
                        {lang === 'fa'
                          ? 'انرژی‌بخش و گرم‌کننده بدن (زعفران، دارچین، گوشت بره، گردو). با چاشنی‌های سرد مانند ماست، خیار، لیمو یا آبغوره متعادل می‌گردد.'
                          : 'Increases metabolic heat (Saffron, lamb, walnuts, cinnamon). Balanced using cooling sides like cucumber, yogurt, lemon, or verjuice.'}
                      </Text>
                    </View>

                    <View style={styles.temperamentGuideRow}>
                      <Text style={[styles.temperamentTagBadge, { backgroundColor: '#082f49', borderColor: '#38bdf8', color: '#bae6fd' }]}>
                        ❄️ {lang === 'fa' ? 'طبع سرد (Sardi)' : 'Cold Nature'}
                      </Text>
                      <Text style={[styles.temperamentGuideDesc, isRTL && styles.textRTL]}>
                        {lang === 'fa'
                          ? 'آرامش‌بخش و خنک‌کننده (برنج، ماهی، ماست، دوغ). مصلح سنتی آن‌ها زعفران، گلاب، نعنا داغ یا سیاه‌دانه است.'
                          : 'Cooling and soothing (White rice, fish, yogurt, fresh herbs). Balanced with warm aromatics like saffron, dried mint, or rosewater.'}
                      </Text>
                    </View>

                    <View style={styles.temperamentGuideRow}>
                      <Text style={[styles.temperamentTagBadge, { backgroundColor: '#064e3b', borderColor: '#34d399', color: '#a7f3d0' }]}>
                        ⚖️ {lang === 'fa' ? 'طبع معتدل (Motadel)' : 'Balanced Nature'}
                      </Text>
                      <Text style={[styles.temperamentGuideDesc, isRTL && styles.textRTL]}>
                        {lang === 'fa'
                          ? 'غذاهایی با توازن طبیعی میان عناصر گرم و سرد که برای همه مزاج‌ها سازگار است.'
                          : 'Innate harmony between warm and cool ingredients suitable for all body constitutions.'}
                      </Text>
                    </View>
                  </ScrollView>

                  <TouchableOpacity style={styles.heritageDismissBtn} onPress={() => setShowTemperamentInfo(false)}>
                    <Text style={styles.heritageDismissBtnText}>{lang === 'fa' ? 'بازگشت' : 'Close'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* GLOBAL TEMPERAMENT MODAL OVERLAY */}
      <Modal visible={showTemperamentInfo && selectedCategory === null} animationType="fade" transparent={true} onRequestClose={() => setShowTemperamentInfo(false)}>
        <View style={styles.heritageModalOverlay}>
          <View style={styles.temperamentCard}>
            <View style={styles.heritageHeaderRow}>
              <Text style={{ fontSize: 26 }}>⚖️</Text>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.heritageModalTitle}>
                  {lang === 'fa' ? 'طبع‌شناسی و مصلحات غذایی' : 'Temperament Balance & Mosleh'}
                </Text>
                <Text style={styles.heritageModalPersian}>Traditional Hot/Cold Nutritional Harmony</Text>
              </View>
              <TouchableOpacity onPress={() => setShowTemperamentInfo(false)} style={styles.closeBadge}>
                <Text style={styles.closeBadgeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginVertical: 8 }}>
              <View style={styles.temperamentGuideRow}>
                <Text style={[styles.temperamentTagBadge, { backgroundColor: '#431407', borderColor: '#f97316', color: '#fdba74' }]}>
                  🔥 {lang === 'fa' ? 'طبع گرم (Garmi)' : 'Warm Nature'}
                </Text>
                <Text style={[styles.temperamentGuideDesc, isRTL && styles.textRTL]}>
                  {lang === 'fa'
                    ? 'انرژی‌بخش و گرم‌کننده بدن (زعفران، دارچین، گوشت بره، گردو). با چاشنی‌های سرد مانند ماست، خیار، لیمو یا آبغوره متعادل می‌گردد.'
                    : 'Increases metabolic heat (Saffron, lamb, walnuts, cinnamon). Balanced using cooling sides like cucumber, yogurt, lemon, or verjuice.'}
                </Text>
              </View>

              <View style={styles.temperamentGuideRow}>
                <Text style={[styles.temperamentTagBadge, { backgroundColor: '#082f49', borderColor: '#38bdf8', color: '#bae6fd' }]}>
                  ❄️ {lang === 'fa' ? 'طبع سرد (Sardi)' : 'Cold Nature'}
                </Text>
                <Text style={[styles.temperamentGuideDesc, isRTL && styles.textRTL]}>
                  {lang === 'fa'
                    ? 'آرامش‌بخش و خنک‌کننده (برنج، ماهی، ماست، دوغ). مصلح سنتی آن‌ها زعفران، گلاب، نعنا داغ یا سیاه‌دانه است.'
                    : 'Cooling and soothing (White rice, fish, yogurt, fresh herbs). Balanced with warm aromatics like saffron, dried mint, or rosewater.'}
                </Text>
              </View>

              <View style={styles.temperamentGuideRow}>
                <Text style={[styles.temperamentTagBadge, { backgroundColor: '#064e3b', borderColor: '#34d399', color: '#a7f3d0' }]}>
                  ⚖️ {lang === 'fa' ? 'طبع معتدل (Motadel)' : 'Balanced Nature'}
                </Text>
                <Text style={[styles.temperamentGuideDesc, isRTL && styles.textRTL]}>
                  {lang === 'fa'
                    ? 'غذاهایی با توازن طبیعی میان عناصر گرم و سرد که برای همه مزاج‌ها سازگار است.'
                    : 'Innate harmony between warm and cool ingredients suitable for all body constitutions.'}
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.heritageDismissBtn} onPress={() => setShowTemperamentInfo(false)}>
              <Text style={styles.heritageDismissBtnText}>{lang === 'fa' ? 'بستن راهنما' : 'Close'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SETTINGS MODAL */}
      <Modal visible={showSettings} animationType="slide" transparent={true} onRequestClose={() => setShowSettings(false)}>
        <View style={styles.heritageModalOverlay}>
          <View style={styles.settingsCard}>
            <View style={styles.heritageHeaderRow}>
              <Text style={styles.heritageIconLarge}>⚙️</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.heritageModalTitle}>{lang === 'fa' ? 'تنظیمات برنامه' : 'Application Settings'}</Text>
                <Text style={styles.heritageModalPersian}>{lang === 'fa' ? 'صدا، حافظه، زبان و ترجیحات' : 'Voice, Memory, Language & Tone'}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSettings(false)} style={styles.closeBadge}>
                <Text style={styles.closeBadgeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginVertical: 14 }}>
              <Text style={styles.settingsSectionTitle}>{lang === 'fa' ? 'انتخاب زبان پیش‌فرض:' : 'Default Language:'}</Text>
              <View style={styles.settingsLangRow}>
                <TouchableOpacity
                  style={[styles.settingsLangBtn, lang === 'en' && styles.settingsLangBtnActive]}
                  onPress={() => setLang('en')}
                >
                  <Text style={[styles.settingsLangBtnText, lang === 'en' && styles.settingsLangBtnTextActive]}>English (US)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.settingsLangBtn, lang === 'fa' && styles.settingsLangBtnActive]}
                  onPress={() => setLang('fa')}
                >
                  <Text style={[styles.settingsLangBtnText, lang === 'fa' && styles.settingsLangBtnTextActive]}>فارسی (Persian)</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.settingsSectionTitle}>
                {lang === 'fa' ? 'سرعت گوینده صوتی در آشپزخانه:' : 'Chef Voice Reading Speed:'}
              </Text>
              <View style={styles.settingsLangRow}>
                {[
                  { label: lang === 'fa' ? 'آهسته (پخت)' : 'Slow (Cooking)', val: 0.75 },
                  { label: lang === 'fa' ? 'استاندارد' : 'Normal', val: 0.85 },
                  { label: lang === 'fa' ? 'سریع' : 'Fast', val: 1.05 },
                ].map((s) => (
                  <TouchableOpacity
                    key={s.val}
                    style={[styles.settingsLangBtn, speechRate === s.val && styles.settingsLangBtnActive]}
                    onPress={() => setSpeechRate(s.val)}
                  >
                    <Text style={[styles.settingsLangBtnText, speechRate === s.val && styles.settingsLangBtnTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.memoryUsageBox}>
                <Text style={styles.memoryUsageTitle}>{lang === 'fa' ? 'وضعیت حافظه محلی ذخیره‌سازی:' : 'Local Flash Storage Status:'}</Text>
                <Text style={styles.memoryUsageText}>• {lang === 'fa' ? 'تعداد دستورهای ذخیره شده:' : 'Saved recipes count:'} {savedRecipes.length}</Text>
                <Text style={styles.memoryUsageText}>• {lang === 'fa' ? 'حجم اشغال شده در فلش دیسک:' : 'Estimated flash memory used:'} ~{(savedRecipes.length * 3.2).toFixed(1)} KB</Text>
                <Text style={styles.memoryUsageText}>• {lang === 'fa' ? 'ظرفیت ذخیره آفلاین:' : 'Offline capacity:'} 10,000+ recipes (&lt;40 MB)</Text>
              </View>

              <TouchableOpacity
                style={styles.settingsActionBtn}
                onPress={() => {
                  setShowSettings(false);
                  setShowCookbook(true);
                }}
              >
                <Text style={styles.settingsActionBtnText}>📖 {lang === 'fa' ? 'مشاهده و مدیریت کتابچه ذخیره‌شده‌ها' : 'Manage Saved Cookbook'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SAVED RECIPES MODAL (WITH MOGHIMI LOGO EMBEDDED)[cite: 1] */}
      <Modal visible={showCookbook} animationType="slide" onRequestClose={() => setShowCookbook(false)}>
        <View style={[styles.rootContainer, { paddingTop: Math.max(insets.top, 18), paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.outerFrame}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => setShowCookbook(false)} style={[styles.backButton, { width: dial.headerSideW }]}>
                <Text style={styles.backButtonText}>‹ {lang === 'fa' ? 'بازگشت' : 'Back'}</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{lang === 'fa' ? 'کتابچه آفلاین شما' : 'Saved Recipes'}</Text>
              <View style={{ width: dial.headerSideW }} />
            </View>

            <ScrollView style={styles.recipeScroll} contentContainerStyle={styles.recipeContent}>
              {savedRecipes.length === 0 ? (
                <View style={styles.centerBoxLarge}>
                  <Text style={styles.emptyPrompt}>
                    {lang === 'fa'
                      ? 'کتابچه آفلاین شما خالی است. روی هر غذا زده و گزینه ذخیره دستور را لمس فرمایید.'
                      : 'Your saved cookbook is empty. Explore dishes from the dial and tap Save Recipe.'}
                  </Text>
                </View>
              ) : (
                savedRecipes.map((item) => (
                  <View key={item.id} style={styles.savedCard}>
                    <View style={styles.recipeTitleRow}>
                      <Text style={styles.savedCardTitle}>{item.title}</Text>
                      <View style={styles.actionButtonRow}>
                        <TouchableOpacity style={styles.shareBtn} onPress={() => handleExportPDF(item.title, item.instructions)}>
                          <Text style={styles.shareBtnText}>📄 PDF</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteSaved(item.id)}>
                          <Text style={styles.deleteBtn}>{lang === 'fa' ? 'حذف' : 'Delete'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={styles.savedCardDate}>{item.category} • {item.created_at}</Text>
                    <Text style={[styles.recipeBodySaved, isRTL ? styles.textRTL : styles.textLTR]}>
                      {cleanAsterisks(item.instructions)}
                    </Text>

                    <View style={styles.savedCardGoldLine} />

                    <View style={styles.logoContainer}>
                      <Image
                        source={require('./assets/moghimi_logo.jpg')}
                        style={styles.moghimiLogo}
                        resizeMode="contain"
                      />
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <PersianAppInner />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#070f1e',
  },
  outerFrame: {
    flex: 1,
    marginHorizontal: 8,
    borderWidth: 3,
    borderColor: '#c59b27',
    borderRadius: 16,
    backgroundColor: '#0c1b33',
    paddingVertical: 8,
    paddingHorizontal: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  header: {
    width: '100%',
    paddingTop: 4,
    paddingBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: '#c59b27',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#f6d860',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: 9,
    color: '#e2e8f0',
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 11,
  },
  langPillContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(12, 27, 51, 0.95)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c59b27',
    overflow: 'hidden',
  },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  langPillActive: {
    backgroundColor: '#c59b27',
  },
  langPillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#f6d860',
  },
  langPillTextActive: {
    color: '#0c1b33',
    fontWeight: '900',
  },
  courseBucketBarWrapper: {
    width: '100%',
    marginVertical: 4,
  },
  courseBucketScroll: {
    paddingHorizontal: 2,
    gap: 6,
  },
  courseBucketPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 36, 68, 0.95)',
    borderWidth: 1.2,
    borderColor: '#c59b27',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  courseBucketPillActive: {
    backgroundColor: '#c59b27',
    borderColor: '#f6d860',
  },
  courseBucketIcon: {
    fontSize: 12,
  },
  courseBucketText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fef08a',
  },
  courseBucketTextActive: {
    color: '#0c1b33',
    fontWeight: '900',
  },
  wheelBottomActionRow: {
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
  },
  compactSurpriseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(120, 53, 15, 0.95)',
    borderWidth: 1.5,
    borderColor: '#f6d860',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
    gap: 8,
  },
  compactSurpriseBtnSpinning: {
    backgroundColor: '#78350f',
    borderColor: '#ffffff',
  },
  compactSurpriseIcon: {
    fontSize: 16,
  },
  compactSurpriseText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#ffffff',
  },
  surpriseOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  surpriseCourseCard: {
    width: '100%',
    backgroundColor: '#0c1b33',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#f6d860',
    padding: 16,
    maxHeight: 520,
  },
  surpriseCourseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#c59b27',
    paddingBottom: 10,
    marginBottom: 10,
  },
  surpriseCourseTitle: {
    color: '#f6d860',
    fontSize: 15,
    fontWeight: '900',
  },
  surpriseCourseSubtitle: {
    color: '#cbd5e1',
    fontSize: 11,
    marginTop: 2,
  },
  surprisePillList: {
    gap: 8,
  },
  surpriseCourseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 36, 68, 0.95)',
    borderWidth: 1.2,
    borderColor: '#c59b27',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  surpriseCourseBtnIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  surpriseCourseBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  surpriseCourseBtnSub: {
    color: '#fef08a',
    fontSize: 9.5,
    marginTop: 1,
  },
  surpriseCourseBtnArrow: {
    color: '#f6d860',
    fontSize: 18,
    fontWeight: '900',
    marginLeft: 6,
  },
  spinConfirmationCard: {
    width: '100%',
    backgroundColor: '#0c1b33',
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: '#f6d860',
    padding: 20,
    alignItems: 'center',
  },
  spinConfirmationIcon: {
    fontSize: 34,
    marginBottom: 8,
  },
  spinConfirmationHeading: {
    color: '#cbd5e1',
    fontSize: 12.5,
    fontWeight: '700',
  },
  spinConfirmationDish: {
    color: '#f6d860',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginVertical: 8,
  },
  spinConfirmationCategory: {
    color: '#94a3b8',
    fontSize: 11.5,
    marginBottom: 14,
  },
  spinConfirmationQuestion: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 18,
  },
  spinConfirmationButtonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  spinConfirmNoBtn: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  spinConfirmNoText: {
    color: '#cbd5e1',
    fontWeight: '800',
    fontSize: 12,
  },
  spinConfirmYesBtn: {
    flex: 1.2,
    backgroundColor: '#c59b27',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  spinConfirmYesText: {
    color: '#0c1b33',
    fontWeight: '900',
    fontSize: 12.5,
  },
  floatingStopBar: {
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 10,
  },
  floatingStopText: {
    color: '#ffffff',
    fontWeight: '900',
    fontSize: 12,
  },
  butlerBucketIndicator: {
    backgroundColor: 'rgba(197, 155, 39, 0.2)',
    borderWidth: 1,
    borderColor: '#f6d860',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  butlerBucketIndicatorText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#f6d860',
  },
  searchBarContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 1.2,
    borderColor: '#c59b27',
    borderRadius: 10,
    paddingHorizontal: 10,
    marginVertical: 4,
    height: 38,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '600',
    paddingVertical: 0,
  },
  searchClearBtn: {
    padding: 4,
  },
  searchClearText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '900',
  },
  searchResultsWrapper: {
    flex: 1,
    width: '100%',
    paddingHorizontal: 2,
  },
  searchResultsHeaderRow: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  searchResultsCountText: {
    color: '#f6d860',
    fontSize: 11,
    fontWeight: '800',
  },
  searchResultsScroll: {
    flex: 1,
    width: '100%',
  },
  searchResultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 36, 68, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.4)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  searchResultIcon: {
    fontSize: 18,
  },
  searchResultTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  searchResultSub: {
    fontSize: 9.5,
    color: '#cbd5e1',
    marginTop: 1,
  },
  searchResultCookBadge: {
    backgroundColor: '#c59b27',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  searchResultCookText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0c1b33',
  },
  searchEmptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  searchEmptyText: {
    fontSize: 12.5,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
  },
  backButton: {
    paddingVertical: 4,
    alignItems: 'flex-start',
  },
  backButtonText: {
    color: '#f6d860',
    fontSize: 15,
    fontWeight: '800',
  },
  dialViewport: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerLogoBadge: {
    backgroundColor: '#0c1b33',
    borderWidth: 1.8,
    borderColor: '#f6d860',
    overflow: 'hidden',
    padding: 2,
  },
  cornerLogoImage: {
    width: '100%',
    height: '100%',
  },
  centeredLogoBadge: {
    borderRadius: 12,
    marginBottom: 6,
  },
  butlerTabContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: '#070f1e',
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  dialContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelBackground: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelImageStyle: {
    borderWidth: 2.5,
    borderColor: '#d4af37',
  },
  centerMedallionContainer: {
    borderWidth: 3,
    borderColor: '#f6d860',
    overflow: 'hidden',
    backgroundColor: '#000',
    zIndex: 10,
    elevation: 8,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerMedallionImage: { width: '100%', height: '100%' },
  bucketCircle: {
    position: 'absolute',
    backgroundColor: 'rgba(12, 27, 51, 0.96)',
    borderWidth: 2,
    borderColor: '#f6d860',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
    padding: 2,
  },
  bucketCircleIcon: {
    fontSize: 17,
  },
  bucketCircleLabel: {
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 11,
    marginTop: 1,
  },
  circleMagnifiedLarge: {
    zIndex: 100,
    transform: [{ scale: 1.65 }],
    backgroundColor: '#081730',
    borderColor: '#ffffff',
    borderWidth: 2.5,
  },
  circleSpinLightGlowing: {
    borderColor: '#ffffff',
    borderWidth: 3.5,
    backgroundColor: '#f6d860',
    transform: [{ scale: 1.3 }],
    shadowColor: '#f6d860',
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 12,
  },
  labelMagnified: {
    fontSize: 11,
    color: '#f6d860',
    fontWeight: '900',
  },
  subDishCircle: {
    position: 'absolute',
    backgroundColor: 'rgba(12, 27, 51, 0.96)',
    borderWidth: 2,
    borderColor: '#f6d860',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
    padding: 3,
  },
  subDishMagnified: {
    zIndex: 100,
    transform: [{ scale: 1.5 }],
    backgroundColor: '#081730',
    borderColor: '#ffffff',
    borderWidth: 2.5,
  },
  subDishIcon: { fontSize: 15 },
  subDishLabel: { fontSize: 8, fontWeight: '800', color: '#ffffff', textAlign: 'center', marginTop: 2, lineHeight: 9.5 },
  subDishLabelMagnified: { fontSize: 8.5, color: '#ffffff', fontWeight: '900' },
  bottomGuidePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 36, 68, 0.95)',
    borderWidth: 1.2,
    borderColor: '#c59b27',
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 16,
    gap: 6,
    marginTop: 4,
    alignSelf: 'center',
  },
  bottomGuideIcon: {
    fontSize: 13,
  },
  bottomGuideText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#f6d860',
  },
  footerInstruction: {
    color: '#e2d9cc',
    fontSize: 9,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingBottom: 2,
  },
  mainFrame: {
    marginHorizontal: 0,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 14,
    justifyContent: 'flex-start',
    backgroundColor: '#070f1e',
  },
  modernHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  modernHeaderTitle: { fontSize: 24, fontWeight: '900', color: '#f6d860' },
  modernHeaderSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  homeScrollContent: { paddingBottom: 24 },
  heroCard: {
    backgroundColor: '#12305c',
    borderRadius: 20,
    padding: 18,
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: '#f6d860',
  },
  heroEyebrow: { color: '#f6d860', fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  heroTitle: { color: '#ffffff', fontSize: 24, fontWeight: '900', marginTop: 6 },
  heroFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  heroIcon: { fontSize: 36 },
  heroCta: { backgroundColor: '#f6d860', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9 },
  heroCtaText: { color: '#0c1b33', fontWeight: '900', fontSize: 13 },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  quickCard: {
    flex: 1,
    backgroundColor: '#0f2240',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  quickIcon: { fontSize: 22 },
  quickTitle: { color: '#e2e8f0', fontSize: 11.5, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  menuBookMainHeading: {
    color: '#f6d860',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 20,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  menuFolioCard: {
    backgroundColor: '#0c1b33',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#c59b27',
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  menuFolioHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuFolioIcon: {
    fontSize: 26,
  },
  menuFolioTitle: {
    color: '#f6d860',
    fontSize: 15,
    fontWeight: '900',
  },
  menuFolioSubtitle: {
    color: '#cbd5e1',
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 2,
  },
  menuFolioOpenDialBtn: {
    backgroundColor: '#c59b27',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  menuFolioOpenDialText: {
    color: '#0c1b33',
    fontSize: 11,
    fontWeight: '900',
  },
  menuFolioGoldDivider: {
    height: 1,
    backgroundColor: 'rgba(197, 155, 39, 0.4)',
    marginVertical: 10,
  },
  menuFolioGrid: {
    gap: 8,
  },
  menuFolioCategoryBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.25)',
    padding: 8,
  },
  menuFolioCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  menuFolioCatIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  menuFolioCatTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  menuFolioCatArrow: {
    color: '#f6d860',
    fontSize: 16,
    fontWeight: '900',
  },
  menuFolioDishesPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  menuFolioDishPill: {
    backgroundColor: 'rgba(12, 27, 51, 0.95)',
    borderWidth: 1,
    borderColor: '#c59b27',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  menuFolioDishPillText: {
    color: '#fef08a',
    fontSize: 9.5,
    fontWeight: '700',
  },
  profileHeader: { alignItems: 'center', paddingVertical: 20 },
  profileAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#12305c',
    borderWidth: 2,
    borderColor: '#f6d860',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: { fontSize: 42 },
  profileName: { color: '#ffffff', fontSize: 20, fontWeight: '900', marginTop: 12 },
  profileStat: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f2240',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  profileRowIcon: { fontSize: 20, width: 34 },
  profileRowText: { flex: 1, color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  profileRowChevron: { color: '#94a3b8', fontSize: 22 },
  tabBar: {
    zIndex: 20,
    elevation: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#0a1628',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148, 163, 184, 0.3)',
    paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  tabIcon: { fontSize: 22 },
  tabIconInactive: { opacity: 0.45 },
  tabIconPill: {
    paddingHorizontal: 18,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabIconPillActive: {
    backgroundColor: 'rgba(246, 216, 96, 0.2)',
    borderColor: 'rgba(246, 216, 96, 0.7)',
  },
  tabLabel: { fontSize: 10.5, color: '#64748b', marginTop: 3, fontWeight: '600' },
  tabLabelActive: { color: '#f6d860', fontWeight: '900' },
  tabCenterButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginTop: -26,
    backgroundColor: '#c59b27',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#0a1628',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  tabCenterButtonActive: { backgroundColor: '#f6d860', borderColor: '#ffffff', transform: [{ scale: 1.08 }] },
  tabCenterIcon: { fontSize: 30 },
  heritageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  inPlaceModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
    padding: 16,
  },
  temperamentCard: {
    width: '100%',
    backgroundColor: '#0c1b33',
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#f6d860',
    padding: 16,
    maxHeight: 480,
  },
  temperamentGuideRow: {
    marginBottom: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c59b27',
  },
  temperamentTagBadge: {
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginBottom: 6,
    overflow: 'hidden',
  },
  temperamentGuideDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: '#e2e8f0',
  },
  heritageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#c59b27',
    paddingBottom: 10,
  },
  heritageIconLarge: { fontSize: 30 },
  heritageModalTitle: { fontSize: 17, fontWeight: '900', color: '#f6d860' },
  heritageModalPersian: { fontSize: 11, color: '#e2e8f0' },
  closeBadge: { padding: 4 },
  closeBadgeText: { fontSize: 18, fontWeight: '900', color: '#f6d860' },
  heritageDismissBtn: {
    backgroundColor: '#c59b27',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 6,
  },
  heritageDismissBtnText: { color: '#0c1b33', fontWeight: '900', fontSize: 12 },
  regionalCard: {
    width: '100%',
    backgroundColor: '#0c1b33',
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#f6d860',
    padding: 16,
  },
  regionalProvinceCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: '#c59b27',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  regionalProvinceTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#f6d860',
    marginBottom: 4,
  },
  regionalProvinceDesc: {
    fontSize: 11.5,
    lineHeight: 17,
    color: '#cbd5e1',
    marginBottom: 8,
  },
  regionalPillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  regionalDishPill: {
    backgroundColor: 'rgba(12, 27, 51, 0.95)',
    borderWidth: 1,
    borderColor: '#f6d860',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  regionalDishPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fef08a',
  },
  userGuideCard: {
    width: '100%',
    backgroundColor: '#0c1b33',
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#f6d860',
    padding: 16,
  },
  guideSectionBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(197, 155, 39, 0.4)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  guideSectionTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#f6d860',
    marginBottom: 4,
  },
  guideSectionText: {
    fontSize: 11.5,
    lineHeight: 18,
    color: '#f1f5f9',
  },
  butlerCard: {
    width: '100%',
    backgroundColor: '#0c1b33',
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#f6d860',
    padding: 16,
  },
  butlerCardTab: {
    flex: 1,
    borderWidth: 1.5,
  },
  fusionSwitchContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  fusionSwitchLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#f6d860',
    marginBottom: 2,
  },
  cuisineSelectorCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 1,
    borderColor: '#c59b27',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  cuisineSelectorHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fef08a',
    marginBottom: 6,
  },
  cuisinePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cuisinePill: {
    backgroundColor: 'rgba(12, 27, 51, 0.9)',
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  cuisinePillActive: {
    backgroundColor: '#c59b27',
    borderColor: '#f6d860',
  },
  cuisinePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  cuisinePillTextActive: {
    color: '#0c1b33',
    fontWeight: '900',
  },
  butlerQuestionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fef08a',
    marginTop: 8,
    marginBottom: 4,
  },
  butlerInput: {
    backgroundColor: 'rgba(16, 36, 68, 0.95)',
    borderWidth: 1,
    borderColor: '#c59b27',
    borderRadius: 8,
    color: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  butlerSubmitBtn: {
    backgroundColor: '#c59b27',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  butlerSubmitBtnText: {
    color: '#0c1b33',
    fontWeight: '800',
    fontSize: 13,
  },
  suggestedContainer: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#c59b27',
  },
  suggestedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#f6d860',
    marginBottom: 2,
  },
  suggestedSubtext: {
    fontSize: 11,
    color: '#e2e8f0',
    marginBottom: 10,
  },
  suggestedCirclesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    gap: 8,
  },
  suggestedDishCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(16, 36, 68, 0.96)',
    borderWidth: 1.5,
    borderColor: '#c59b27',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  suggestedDishCircleActive: {
    backgroundColor: '#78350f',
    borderColor: '#ffffff',
    borderWidth: 2,
    transform: [{ scale: 1.08 }],
  },
  suggestedDishIcon: {
    fontSize: 14,
  },
  suggestedDishName: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 1,
    lineHeight: 9,
  },
  suggestedDishNameActive: {
    color: '#fef08a',
  },
  suggestedDishRole: {
    fontSize: 6.5,
    color: '#f6d860',
    fontWeight: '600',
  },
  butlerResponseBox: {
    marginTop: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f6d860',
  },
  butlerResponseTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#f6d860',
    flex: 1,
  },
  fullScreenRecipeScroll: {
    flex: 1,
    width: '100%',
  },
  fullScreenRecipeContent: {
    padding: 10,
    paddingBottom: 40,
  },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  infoChip: {
    flex: 1,
    backgroundColor: '#0f2240',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  infoChipLabel: { fontSize: 10.5, color: '#94a3b8', fontWeight: '700' },
  infoChipValue: { fontSize: 12.5, color: '#f1f5f9', fontWeight: '800', marginTop: 2 },
  macroCard: {
    flexDirection: 'row',
    backgroundColor: '#0f2240',
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  macroCol: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  macroColDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(148, 163, 184, 0.35)' },
  macroBigValue: { fontSize: 17, fontWeight: '900', color: '#f6d860' },
  macroSmallLabel: { fontSize: 10.5, color: '#94a3b8', fontWeight: '700', marginTop: 3 },
  macroCaption: { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 6, marginBottom: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxOn: { backgroundColor: '#f6d860', borderColor: '#f6d860' },
  checkboxTick: { color: '#0c1b33', fontWeight: '900', fontSize: 14, lineHeight: 16 },
  ingredientRowDone: { opacity: 0.55 },
  ingredientTextDone: { textDecorationLine: 'line-through' },
  recipeTabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#0f2240',
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  recipeTabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  recipeTabBtnActive: {
    backgroundColor: '#f6d860',
  },
  recipeTabBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94a3b8',
    textAlign: 'center',
  },
  recipeTabBtnTextActive: {
    color: '#0c1b33',
    fontWeight: '900',
  },
  recipeSectionBlock: {
    backgroundColor: '#0f2240',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    padding: 16,
    marginBottom: 10,
  },
  sectionHeaderFlex: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    marginBottom: 10,
  },
  recipeSectionHeading: {
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
    flex: 1,
  },
  miniAudioBtn: {
    backgroundColor: 'rgba(246, 216, 96, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  miniAudioBtnActive: {
    backgroundColor: '#ef4444',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1a33',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  voiceStepToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0a1a33',
    borderRadius: 14,
    padding: 8,
    marginBottom: 12,
  },
  stepControlBtn: {
    backgroundColor: '#12305c',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  stepCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0a1a33',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  stepNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f6d860',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAudioText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#ffffff',
  },
  recipeSectionBody: {
    fontSize: 14.5,
    lineHeight: 23,
    color: '#f8fafc',
  },
  ingredientsGrid: {
    gap: 6,
  },
  ingredientRowRTL: {
    flexDirection: 'row-reverse',
  },
  ingredientText: {
    fontSize: 14,
    color: '#ffffff',
    flex: 1,
    fontWeight: '600',
    lineHeight: 20,
  },
  voiceStepLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#fef08a',
  },
  stepControlBtnHighlight: {
    backgroundColor: '#78350f',
  },
  stepControlBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  stepCardRowActive: {
    borderColor: '#f6d860',
    backgroundColor: 'rgba(120, 53, 15, 0.6)',
    borderWidth: 1.5,
  },
  stepNumberText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0c1b33',
  },
  stepText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#f8fafc',
    flex: 1,
  },
  stepAudioIcon: {
    fontSize: 14,
    alignSelf: 'center',
  },
  textRTL: {
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  textLTR: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  centerBoxLarge: {
    paddingVertical: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingHourglassIcon: {
    fontSize: 34,
    marginTop: 12,
  },
  loadingTextLarge: {
    marginTop: 12,
    fontSize: 14,
    color: '#f6d860',
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  recipeTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#c59b27',
    paddingBottom: 6,
  },
  actionButtonRow: { flexDirection: 'row', gap: 6 },
  shareBtn: { backgroundColor: '#0284c7', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  shareBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 10 },
  saveRecipeBtn: { backgroundColor: '#c59b27', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  saveRecipeBtnText: { color: '#0c1b33', fontWeight: '900', fontSize: 10 },
  savedCard: {
    backgroundColor: '#0c1b33',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#c59b27',
    marginBottom: 16,
  },
  savedCardTitle: { fontSize: 16, fontWeight: '800', color: '#f6d860', flex: 1 },
  deleteBtn: { color: '#ef4444', fontWeight: '700', fontSize: 12, marginLeft: 8 },
  savedCardDate: { fontSize: 11, color: '#94a3b8', marginBottom: 8 },
  recipeBodySaved: { fontSize: 13, lineHeight: 20, color: '#e2e8f0' },
  savedCardGoldLine: {
    height: 1.5,
    backgroundColor: '#c59b27',
    marginVertical: 14,
    width: '100%',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  moghimiLogo: {
    width: 190,
    height: 48,
  },
  emptyPrompt: { fontSize: 13, color: '#cbd5e1', textAlign: 'center', paddingHorizontal: 20, lineHeight: 20 },
  settingsCard: {
    width: '100%',
    backgroundColor: '#0c1b33',
    borderRadius: 16,
    borderWidth: 2.5,
    borderColor: '#f6d860',
    padding: 16,
    maxHeight: 520,
  },
  settingsSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#f6d860',
    marginBottom: 8,
  },
  settingsLangRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  settingsLangBtn: {
    flex: 1,
    backgroundColor: 'rgba(16, 36, 68, 0.95)',
    borderWidth: 1.5,
    borderColor: '#c59b27',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  settingsLangBtnActive: {
    backgroundColor: '#c59b27',
  },
  settingsLangBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#f6d860',
  },
  settingsLangBtnTextActive: {
    color: '#0c1b33',
    fontWeight: '900',
  },
  memoryUsageBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: '#c59b27',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  memoryUsageTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#fef08a',
  },
  memoryUsageText: {
    fontSize: 11.5,
    color: '#cbd5e1',
    lineHeight: 18,
  },
  settingsActionBtn: {
    backgroundColor: '#c59b27',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  settingsActionBtnText: {
    color: '#0c1b33',
    fontWeight: '900',
    fontSize: 12,
  },
});