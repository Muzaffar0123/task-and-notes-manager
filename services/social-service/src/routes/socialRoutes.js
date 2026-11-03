const express = require("express");
const authenticateToken = require("../middleware/authMiddleware");
const feedController = require("../controllers/feedController");
const followController = require("../controllers/followController");
const interactionController = require("../controllers/interactionController");
const engagementProxyController = require("../controllers/engagementProxyController");
const collectionController = require("../controllers/collectionController");
const profileController = require("../controllers/profileController");
const discoveryController = require("../controllers/discoveryController");

const router = express.Router();
router.use(authenticateToken);

router.get("/feed", feedController.getFeed);
router.get("/trending", feedController.getTrending);
router.get("/profiles/:username", profileController.getProfile);
router.get("/users/discover", discoveryController.getUsers);
router.get("/creators/popular", discoveryController.getPopularCreators);
router.get("/users/:userId/follow-status", discoveryController.getFollowStatus);
router.get("/notes/discover", discoveryController.discoverPublicNotes);
router.post("/follows", followController.followUser);
router.get("/follows/following", followController.getFollowing);
router.get("/follows/followers", followController.getFollowers);
router.delete("/follows/:userId", followController.unfollowUser);

router.get("/notes/:noteId/engagement", engagementProxyController.getEngagement);
router.get("/notes/:noteId/likes", engagementProxyController.getLikes);
router.post("/notes/:noteId/likes", engagementProxyController.likeNote);
router.delete("/notes/:noteId/likes", engagementProxyController.unlikeNote);
router.get("/notes/:noteId/comments", interactionController.listComments);
router.post("/notes/:noteId/comments", interactionController.createComment);
router.patch("/notes/:noteId/comments/:commentId", interactionController.updateComment);
router.delete("/notes/:noteId/comments/:commentId", interactionController.deleteComment);
router.get("/notes/:noteId/ratings", engagementProxyController.getRatings);
router.put("/notes/:noteId/ratings", engagementProxyController.rateNote);
router.post("/notes/:noteId/bookmark", interactionController.bookmarkNote);
router.delete("/notes/:noteId/bookmark", interactionController.removeBookmark);
router.get("/bookmarks", interactionController.listBookmarks);

router.post("/collections", collectionController.createCollection);
router.get("/collections", collectionController.listCollections);
router.patch("/collections/:collectionId", collectionController.renameCollection);
router.delete("/collections/:collectionId", collectionController.deleteCollection);
router.get("/collections/:collectionId/items", collectionController.listCollectionItems);
router.post("/collections/:collectionId/items", collectionController.addBookmarkToCollection);
router.delete("/collections/:collectionId/items/:bookmarkId", collectionController.removeBookmarkFromCollection);

module.exports = router;