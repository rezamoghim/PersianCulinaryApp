import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('persian_culinary.db');

export interface RecipeRecord {
  id: number;
  title: string;
  category: string;
  prep_time: string;
  ingredients: string;
  instructions: string;
  tahdig_tip: string;
  is_favorite: number;
  created_at: string;
}

export function initDatabase(): void {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      prep_time TEXT,
      ingredients TEXT NOT NULL,
      instructions TEXT NOT NULL,
      tahdig_tip TEXT,
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export function insertRecipe(
  title: string,
  category: string,
  prepTime: string,
  ingredients: string,
  instructions: string,
  tahdigTip: string = ''
): number {
  const statement = db.prepareSync(`
    INSERT INTO recipes (title, category, prep_time, ingredients, instructions, tahdig_tip)
    VALUES ($title, $category, $prep_time, $ingredients, $instructions, $tahdig_tip);
  `);
  const result = statement.executeSync({
    $title: title,
    $category: category,
    $prep_time: prepTime,
    $ingredients: ingredients,
    $instructions: instructions,
    $tahdig_tip: tahdigTip,
  });
  return result.lastInsertRowId;
}

export function getAllSavedRecipes(): RecipeRecord[] {
  const statement = db.prepareSync(`
    SELECT * FROM recipes ORDER BY id DESC;
  `);
  const result = statement.executeSync<RecipeRecord>();
  return result.getAllSync();
}

export function deleteRecipeById(id: number): void {
  const statement = db.prepareSync(`
    DELETE FROM recipes WHERE id = $id;
  `);
  statement.executeSync({ $id: id });
}