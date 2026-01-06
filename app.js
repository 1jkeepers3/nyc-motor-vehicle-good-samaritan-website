import 'dotenv/config';
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import exphbs from "express-handlebars";
import configRoutes from "./routes/index.js";
import { logger } from "./middleware.js";
import path from "path";
import mongoose from "mongoose";


const app = express();

app.set('trust proxy', 1);

const mongoUrl = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/myAppDB";
mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

  
const rewriteUnsupportedBrowserMethods = (req, res, next) => {
  // If the user posts to the server with a property called _method, rewrite the request's method
  // To be that method; so if they post _method=PUT you can now allow browsers to POST to a route that gets
  // rewritten in this middleware to a PUT route
  if (req.body && req.body._method) {
    req.method = req.body._method;
    delete req.body._method;
  }

  // let the next middleware run:
  next();
};

app.use("/public", express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rewriteUnsupportedBrowserMethods);
// register a few small Handlebars helpers for templates
const hbsHelpers = {
  // return first photo URL or fallback image
  firstPhoto(photos) {
    try {
      if (!photos || !Array.isArray(photos) || photos.length === 0) {
        return "/public/images/no-image-available.png";
      }
      return photos[0] || "/public/images/no-image-available.png";
    } catch (e) {
      return "/public/images/no-image-available.png";
    }
  },
  // truncate a string to `len` characters (len provided as number)
  truncate(str, len) {
    if (!str) return "";
    const s = String(str);
    const n = Number(len) || 100;
    if (s.length <= n) return s;
    return s.slice(0, n) + "...";
  },
  json(context) {
    try {
      return JSON.stringify(context);
    } catch (e) {
      return "null";
    }
  },
  ifCond(v1, v2, options) {
    if (v1.toString() === v2.toString()) {
      return options.fn(this);
    }
    return options.inverse(this);
  },
};

app.engine(
  "handlebars",
  exphbs.engine({ defaultLayout: "main", helpers: hbsHelpers })
);
app.set("view engine", "handlebars");

app.use(
  session({
    name: "AuthenticationState",
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
    store: MongoStore.create({
      mongoUrl,
      ttl: 60 * 60, // 1 hour
      autoRemove: "native",
    }),
    cookie: {
      maxAge: 1000 * 60 * 60, // 1 hour
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);

// Log session for debugging
app.use((req, res, next) => {
  console.log("Session:", req.session);
  next();
});

app.use(logger);

configRoutes(app);

app.use((req, res) => {
  res.status(404).render("error", {
    title: "404 Not Found",
    error: "Page Not Found",
    user: req.session.user,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

