const express = require("express");
const controller = require("../controllers/adminUserController");

const router = express.Router();

router.get("/users", controller.listUsers);
router.get("/users/:userId", controller.getUser);
router.patch("/users/:userId/status", controller.setUserStatus);

module.exports = router;
