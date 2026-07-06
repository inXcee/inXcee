import { z } from 'zod'

// Cross-cutting Zod sweep — performance. validate() gate olarak eklenir;
// handler'lar req.body okumaya devam eder (calcTotal/alan döngüleri korunur).
const score = z.coerce.number().int().min(1, 'Puan 1-5 arası olmalı').max(5, 'Puan 1-5 arası olmalı').nullish()
const reviewText = z.string().trim().max(4000, 'Metin çok uzun').nullish()

export const createReviewSchema = z.object({
  staff_id: z.coerce.number({ invalid_type_error: 'staff_id gerekli' }).int().positive('staff_id gerekli'),
  period: z.string().regex(/^\d{4}(-Q[1-4])?$/, 'period: YYYY veya YYYY-Q1 formatında'),
  productivity: score, teamwork: score, attendance: score, attitude: score,
  skills: score, initiative: score, reliability: score, communication: score,
  strengths: reviewText, improvement_areas: reviewText, manager_notes: reviewText,
})

export const updateReviewSchema = z.object({
  productivity: score, teamwork: score, attendance: score, attitude: score,
  skills: score, initiative: score, reliability: score, communication: score,
  strengths: reviewText, improvement_areas: reviewText, manager_notes: reviewText,
})

export const createGoalSchema = z.object({
  staff_id: z.coerce.number({ invalid_type_error: 'staff_id gerekli' }).int().positive('staff_id gerekli'),
  title: z.string().trim().min(1, 'title gerekli').max(200, 'Başlık çok uzun'),
  description: z.string().trim().max(2000).nullish(),
  target_date: z.string().trim().max(40).nullish(),
})

export const positiveSchema = z.object({
  staff_id: z.coerce.number({ invalid_type_error: 'staff_id gerekli' }).int().positive('staff_id gerekli'),
  reason: z.string().trim().min(1, 'reason gerekli').max(500, 'Gerekçe çok uzun'),
  points: z.coerce.number().int().min(1).max(100).optional(),
})
