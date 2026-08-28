import type { BillStatus } from "@prisma/client";

function daysOverdue(dueDate: Date, asOf: Date = new Date()) {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date(asOf);
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
  return Math.max(0, diff);
}

export function computeBillStatus(
  total: number,
  paid: number,
  dueDate: Date,
): BillStatus {
  if (paid <= 0) {
    return daysOverdue(dueDate) > 0 ? "OVERDUE" : "PENDING";
  }
  if (paid + 0.001 >= total) return "PAID";
  return daysOverdue(dueDate) > 0 ? "OVERDUE" : "PARTIAL";
}
