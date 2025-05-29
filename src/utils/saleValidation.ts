import { ISaleOff } from "../models/productModel";

/**
 * Validates if a sale offer is currently active based on time period
 * @param saleOff - The sale offer object containing startDate and endDate
 * @param currentDate - Optional current date for testing, defaults to new Date()
 * @returns boolean indicating if the sale is currently active
 */
export function isSaleOfferActive(
  saleOff: ISaleOff | null | undefined,
  currentDate: Date = new Date()
): boolean {
  if (!saleOff) {
    return false;
  }

  // Check if required fields exist
  if (!saleOff.startDate || !saleOff.endDate || !saleOff.percentage) {
    return false;
  }

  // Check if percentage is valid
  if (saleOff.percentage <= 0 || saleOff.percentage > 100) {
    return false;
  }

  const startDate = new Date(saleOff.startDate);
  const endDate = new Date(saleOff.endDate);

  // Validate date range
  if (endDate <= startDate) {
    return false;
  }

  // Check if current time is within the sale period
  return currentDate >= startDate && currentDate <= endDate;
}

/**
 * Calculates the final price for a variant considering sale offers
 * @param originalPrice - The original price of the variant
 * @param saleOff - The sale offer object
 * @param currentDate - Optional current date for testing, defaults to new Date()
 * @returns The final price after applying sale discount if applicable
 */
export function calculateFinalPrice(
  originalPrice: number,
  saleOff: ISaleOff | null | undefined,
  currentDate: Date = new Date()
): number {
  if (!isSaleOfferActive(saleOff, currentDate)) {
    return originalPrice;
  }

  const discount = (originalPrice * saleOff!.percentage) / 100;
  const finalPrice = originalPrice - discount;

  // Round to nearest 100 VND (common practice in Vietnamese e-commerce)
  return Math.round(finalPrice / 100) * 100;
}

/**
 * Calculates the sale discount amount
 * @param originalPrice - The original price of the variant
 * @param saleOff - The sale offer object
 * @param currentDate - Optional current date for testing, defaults to new Date()
 * @returns The discount amount if sale is active, otherwise 0
 */
export function calculateSaleDiscount(
  originalPrice: number,
  saleOff: ISaleOff | null | undefined,
  currentDate: Date = new Date()
): number {
  if (!isSaleOfferActive(saleOff, currentDate)) {
    return 0;
  }

  return Math.round((originalPrice * saleOff!.percentage) / 100 / 100) * 100;
}

/**
 * Validates sale offer data for creation/update operations
 * @param saleOff - The sale offer object to validate
 * @returns Object with validation result and error message if invalid
 */
export function validateSaleOffer(saleOff: Partial<ISaleOff>): {
  isValid: boolean;
  error?: string;
} {
  if (!saleOff) {
    return { isValid: true }; // No sale offer is valid
  }

  if (!saleOff.percentage || !saleOff.startDate || !saleOff.endDate) {
    return {
      isValid: false,
      error:
        "Missing required sale offer fields (percentage, startDate, endDate)",
    };
  }

  if (saleOff.percentage <= 0 || saleOff.percentage > 100) {
    return {
      isValid: false,
      error: "Sale offer percentage must be between 1 and 100",
    };
  }

  const startDate = new Date(saleOff.startDate);
  const endDate = new Date(saleOff.endDate);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { isValid: false, error: "Invalid date format in sale offer" };
  }

  if (endDate <= startDate) {
    return {
      isValid: false,
      error: "Sale offer end date must be after start date",
    };
  }

  const now = new Date();
  if (endDate <= now) {
    return {
      isValid: false,
      error: "Sale offer end date must be in the future",
    };
  }

  return { isValid: true };
}

/**
 * Gets time-related information about a sale offer
 * @param saleOff - The sale offer object
 * @param currentDate - Optional current date for testing, defaults to new Date()
 * @returns Object with sale timing information
 */
export function getSaleOfferStatus(
  saleOff: ISaleOff | null | undefined,
  currentDate: Date = new Date()
): {
  isActive: boolean;
  hasStarted: boolean;
  hasEnded: boolean;
  timeUntilStart?: number; // milliseconds
  timeUntilEnd?: number; // milliseconds
} {
  if (!saleOff || !saleOff.startDate || !saleOff.endDate) {
    return { isActive: false, hasStarted: false, hasEnded: false };
  }

  const startDate = new Date(saleOff.startDate);
  const endDate = new Date(saleOff.endDate);
  const now = currentDate.getTime();

  const hasStarted = now >= startDate.getTime();
  const hasEnded = now > endDate.getTime();
  const isActive = hasStarted && !hasEnded;

  return {
    isActive,
    hasStarted,
    hasEnded,
    timeUntilStart: hasStarted ? undefined : startDate.getTime() - now,
    timeUntilEnd: hasEnded ? undefined : endDate.getTime() - now,
  };
}
