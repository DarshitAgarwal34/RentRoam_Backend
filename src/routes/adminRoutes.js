const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authMiddleware');

const adminController = require('../controllers/adminController');
const adminManage = require('../controllers/adminManageController');

// auth
router.post('/login', adminController.login);
router.post('/signup', adminController.signup);

// protected admin-only
router.get('/customers', auth.authenticateJWT, adminManage.listCustomers);
router.get('/customers/:id', auth.authenticateJWT, adminManage.getCustomerById);
router.get('/owners', auth.authenticateJWT, adminManage.listOwners);
router.get('/stats', auth.authenticateJWT, adminManage.getStats);
router.patch('/customers/:id', auth.authenticateJWT, adminManage.updateCustomer);
router.delete('/customers/:id', auth.authenticateJWT, adminManage.deleteCustomer);
router.patch('/owners/:id', auth.authenticateJWT, adminManage.updateOwner);
router.delete('/owners/:id', auth.authenticateJWT, adminManage.deleteOwner);



module.exports = router;
