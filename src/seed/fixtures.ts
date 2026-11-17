import { randomUUID } from "node:crypto";
import type { SeedContact, SeedMedication, SeedUser } from "./types.js";

export const DEMO_EMAIL = "demo@episafe.app";
/** Credencial de demostracion publica; solo para entornos de desarrollo. */
export const DEMO_PASSWORD = "Demo1234!";

export function demoUser(): SeedUser {
  return {
    id: randomUUID(),
    email: DEMO_EMAIL,
    fullName: "Laura Martinez",
    birthDate: "1994-03-12",
    timezone: "America/Bogota",
  };
}

export function demoContacts(): SeedContact[] {
  return [
    { id: randomUUID(), name: "Carlos Martinez", relationship: "Padre", phone: "+573001112233",
      email: "carlos.martinez@example.com", priority: 1, notifySms: true, notifyEmail: true },
    { id: randomUUID(), name: "Andrea Gomez", relationship: "Pareja", phone: "+573004445566",
      email: "andrea.gomez@example.com", priority: 2, notifySms: true, notifyEmail: true },
    { id: randomUUID(), name: "Dra. Paula Rojas", relationship: "Neuróloga", phone: "+576015550123",
      email: "paula.rojas@example.com", priority: 3, notifySms: false, notifyEmail: true },
  ];
}

export function demoMedications(): SeedMedication[] {
  return [
    { id: randomUUID(), name: "Levetiracetam", dose: 500, unit: "mg", scheduleTimes: ["08:00", "20:00"],
      notes: "Con comida. No suspender sin indicacion medica." },
    { id: randomUUID(), name: "Lamotrigina", dose: 100, unit: "mg", scheduleTimes: ["21:00"],
      notes: "Dosis nocturna" },
  ];
}
