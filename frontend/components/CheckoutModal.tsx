"use client";

import React, { useState, useEffect } from "react";
import { checkoutBooking, getBills, Bill, CheckoutResponse } from "@/lib/billingApi";
import type { Booking } from "@/lib/bookingsApi";
import type { Guest } from "@/lib/guestsApi";
import type { Room } from "@/lib/roomsApi";
import toast from "react-hot-toast";
import {
  LogOut,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  User,
  DoorOpen,
  Receipt,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: Booking | null;
  guest: Guest | null;
  room: Room | null;
  bill?: Bill | null;
  onSuccess: (result: CheckoutResponse) => void;
  onViewBill?: (billId: number) => void;
}

const formatCurrency = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined || val === "") return "$0.00";
  const num = typeof val === "number" ? val : parseFloat(val);
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
};

export default function CheckoutModal(props: CheckoutModalProps) {
  if (!props.isOpen || !props.booking) return null;
  return <CheckoutDialogContent {...props} booking={props.booking} />;
}

function CheckoutDialogContent({
  onClose,
  booking,
  guest,
  room,
  bill: initialBill,
  onSuccess,
  onViewBill,
}: CheckoutModalProps & { booking: Booking }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResponse | null>(null);
  const [activeBill, setActiveBill] = useState<Bill | null>(initialBill || null);
  const [isLoadingBill, setIsLoadingBill] = useState(() => !initialBill);

  // If bill wasn't provided, fetch existing bill on mount
  useEffect(() => {
    let isMounted = true;
    if (!initialBill) {
      getBills({ booking_id: booking.booking_id })
        .then((bills) => {
          if (isMounted) {
            setActiveBill(bills.length > 0 ? bills[0] : null);
          }
        })
        .catch(() => {
          if (isMounted) setActiveBill(null);
        })
        .finally(() => {
          if (isMounted) setIsLoadingBill(false);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [booking.booking_id, initialBill]);

  const handleConfirmCheckout = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await checkoutBooking(booking.booking_id);
      toast.success(res.message || "Checkout completed successfully");
      setCheckoutResult(res);
      onSuccess(res);
    } catch (error: unknown) {
      const axiosErr = error as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      const msg =
        axiosErr.response?.data?.error ||
        axiosErr.message ||
        "Failed to check out booking";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const balanceNum = activeBill ? parseFloat(activeBill.balance_due) || 0 : 0;
  const isAlreadyCheckedOut = booking.status === "checked_out";
  const isInvalidState = booking.status === "cancelled" || booking.status === "no_show";

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={() => !isSubmitting && onClose()}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
          {/* Modal Header */}
          <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {checkoutResult ? "Checkout Completed" : "Confirm Guest Checkout"}
                </h2>
                <p className="text-xs text-gray-500">
                  {booking.booking_ref} (Booking #{booking.booking_id})
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* SUCCESS STATE */}
            {checkoutResult ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-bold">Checkout Finalized Successfully</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      The reservation stay is concluded. Room status has transitioned to <strong>Dirty</strong> for housekeeping inspection.
                    </p>
                  </div>
                </div>

                {/* Result Breakdown Card */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between items-center text-gray-700">
                    <span className="font-medium">Booking Status:</span>
                    <span className="font-bold text-gray-900 uppercase">
                      {checkoutResult.booking.status}
                    </span>
                  </div>

                  {checkoutResult.room && (
                    <div className="flex justify-between items-center text-gray-700">
                      <span className="font-medium">Room Cleanliness:</span>
                      <span className="px-2 py-0.5 rounded-full font-bold uppercase bg-amber-100 text-amber-800">
                        {checkoutResult.room.cleanliness_status}
                      </span>
                    </div>
                  )}

                  {checkoutResult.bill && (
                    <>
                      <div className="pt-2 border-t border-gray-200 flex justify-between items-center text-gray-700">
                        <span className="font-medium">Folio / Invoice #:</span>
                        <span className="font-mono font-bold text-gray-900">
                          {checkoutResult.bill.invoice_number}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-gray-700">
                        <span className="font-medium">Total Invoiced:</span>
                        <span className="font-mono font-semibold">
                          {formatCurrency(checkoutResult.bill.total_amount)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-gray-700">
                        <span className="font-medium">Outstanding Balance:</span>
                        <span
                          className={`font-mono font-bold ${
                            parseFloat(checkoutResult.bill.balance_due) === 0
                              ? "text-emerald-700"
                              : "text-amber-700"
                          }`}
                        >
                          {formatCurrency(checkoutResult.bill.balance_due)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  {checkoutResult.bill && onViewBill && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onViewBill(checkoutResult.bill.bill_id);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Open Generated Bill</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* CONFIRMATION STATE */
              <>
                {/* Error Banner */}
                {errorMessage && (
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 font-medium">
                      {errorMessage}
                    </p>
                  </div>
                )}

                {/* State warnings */}
                {isAlreadyCheckedOut && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>This booking is already checked out.</span>
                  </div>
                )}

                {isInvalidState && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Cannot checkout a booking with status &apos;{booking.status}&apos;.</span>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* Guest Info */}
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                    <span className="font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 text-[10px]">
                      <User className="w-3.5 h-3.5 text-gray-400" /> Guest
                    </span>
                    <p className="font-bold text-gray-900">
                      {guest ? `${guest.first_name} ${guest.last_name}` : `Guest #${booking.guest_id}`}
                    </p>
                    {guest?.phone && <p className="text-gray-500">{guest.phone}</p>}
                  </div>

                  {/* Room Info */}
                  <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-1">
                    <span className="font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 text-[10px]">
                      <DoorOpen className="w-3.5 h-3.5 text-gray-400" /> Room
                    </span>
                    <p className="font-bold text-gray-900">
                      {room ? `Room ${room.room_number}` : "Room Unassigned"}
                    </p>
                    {room && <p className="text-gray-500">Floor {room.floor} • {room.room_type || "Standard"}</p>}
                  </div>
                </div>

                {/* Stay Dates */}
                <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>Stay Period:</span>
                    <strong className="text-gray-900">
                      {booking.check_in_date} → {booking.check_out_date || "Open"}
                    </strong>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                    {booking.status}
                  </span>
                </div>

                {/* Financial & Folio Status */}
                <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between font-semibold text-blue-900">
                    <span className="flex items-center gap-1.5">
                      <Receipt className="w-3.5 h-3.5 text-blue-600" />
                      Folio Status:
                    </span>
                    {isLoadingBill ? (
                      <span className="text-gray-400 animate-pulse">Checking folio...</span>
                    ) : activeBill ? (
                      <span className="font-mono text-gray-900 font-bold">
                        {activeBill.invoice_number}
                      </span>
                    ) : (
                      <span className="text-amber-700 font-medium">Auto-generated at checkout</span>
                    )}
                  </div>

                  {activeBill && (
                    <div className="pt-2 border-t border-blue-200/60 space-y-1">
                      <div className="flex justify-between text-gray-600">
                        <span>Total Folio Amount:</span>
                        <span className="font-mono font-medium text-gray-900">
                          {formatCurrency(activeBill.total_amount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-emerald-700">
                        <span>Paid:</span>
                        <span className="font-mono font-medium">
                          {formatCurrency(activeBill.paid_amount)}
                        </span>
                      </div>
                      <div className="flex justify-between font-bold pt-1 border-t border-blue-200/40">
                        <span className="text-gray-800">Remaining Balance:</span>
                        <span
                          className={`font-mono text-sm ${
                            balanceNum === 0 ? "text-emerald-700" : "text-amber-700"
                          }`}
                        >
                          {formatCurrency(activeBill.balance_due)}
                        </span>
                      </div>

                      {balanceNum > 0 && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>
                            Notice: A balance of {formatCurrency(activeBill.balance_due)} is still open. Checkout will finalize the stay, leaving the bill available for collection.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Important Notice */}
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-gray-500">
                  <p>
                    <strong>Authoritative Action:</strong> Finalizing checkout will record the departure time, transition the room cleanliness to <strong>Dirty</strong> for housekeeping, and issue or finalize the stay invoice.
                  </p>
                </div>

                {/* Modal Footer */}
                <div className="pt-3 border-t border-gray-200 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition shadow-2xs"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmCheckout}
                    disabled={isSubmitting || isAlreadyCheckedOut || isInvalidState}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition shadow-2xs disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing Checkout...</span>
                      </>
                    ) : (
                      <>
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Confirm &amp; Checkout</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
