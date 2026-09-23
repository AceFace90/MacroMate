export function scaleFood(food, newQty) {
  const base = food.quantity_g || 100;
  const scale = newQty / base;
  return {
    ...food,
    calories: Math.round((food.calories || 0) * scale),
    protein_g: Math.round((food.protein_g || 0) * scale * 10) / 10,
    carbs_g: Math.round((food.carbs_g || 0) * scale * 10) / 10,
    fat_g: Math.round((food.fat_g || 0) * scale * 10) / 10,
    quantity_g: newQty,
  };
}
