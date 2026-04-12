import { signup, signIn, signOut } from '#src/controllers/auth.controller.js';
import express from 'express';

const router = express.Router();

// Placeholder for authentication routes
router.post('/sign-up', signup);

router.post('/sign-in', signIn);

router.post('/sign-out', signOut);

export default router;
