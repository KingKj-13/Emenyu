/**
 * Recommended-order bundles.
 *
 * The guest-facing "order like a regular" strip was removed with the cart —
 * these are still managed in the admin panel, so the shape lives here rather
 * than in the deleted customer constants file.
 */
export interface PersonaOrderItem {
  course: string;
  itemName: string;
  price: number;
}

export interface PersonaOrder {
  slug?: string;
  persona: string;
  description: string;
  icon: string;
  accent: string;
  items: PersonaOrderItem[];
}
