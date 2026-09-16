/**
 * Shape of the order snapshot the client sends to the Edge Function.
 * Mirrors the canonical order/payment records in js/payment/order-store.js.
 */
import type { OrderItem } from '../shared/order-blocks.ts';

export interface OrderCustomer {
  fullName: string;
  email: string;
  phone?: string;
}

export interface OrderDelivery {
  address: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
  instructions?: string;
}

export interface OrderPricing {
  subtotal: number;
  shippingStatus: string;
  productPaymentTotal: number;
  totalPaid?: number;
  shippingAmount?: number;
  currency?: string;
}

export interface OrderPayload {
  id: string;
  orderNumber?: string;
  createdAt: string;
  flow: 'nigeria_checkout' | 'international_checkout';
  customer: OrderCustomer;
  items: OrderItem[];
  pricing: OrderPricing;
  delivery: OrderDelivery;
  securityToken?: string;
  storeUrl?: string;
}

export interface ShippingQuote {
  amount: number;
  currency?: string;
  provider?: string;
  method?: string;
  estimatedDelivery?: string;
}

export interface ShippingPayment {
  reference?: string;
}

export interface Tracking {
  carrier?: string;
  trackingNumber: string;
  trackingUrl?: string;
}

export function isNigeriaFlow(order: OrderPayload): boolean {
  return order.flow === 'nigeria_checkout';
}

export function orderRef(order: OrderPayload): string {
  return order.orderNumber || order.id;
}
