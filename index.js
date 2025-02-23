import { Server } from "socket.io";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import cors from "cors";
import bodyParser from "body-parser";

dotenv.config();

const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
app.use(bodyParser.json());
app.use(express.json());
app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

app.get("/", (req, res) => {
  return res.json({
    success: true,
    message: "Your server is up and running",
  });
});


const emailToSocketMap = new Map();
const socketidToEmailMap = new Map();

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("room:join", ({ email, roomId }) => {
    if (!email || !roomId) {
      console.error("Missing email or roomId:", { email, roomId });
      return;
    }

    console.log(`User ${email} is joining room ${roomId}`);

    emailToSocketMap.set(email, socket.id);
    socketidToEmailMap.set(socket.id, email);

    io.to(roomId).emit("user:join", { email, id: socket.id });

    socket.join(roomId);

    io.to(socket.id).emit("room:join", {
      message: `You joined room ${roomId}`,
      roomId,
      email,
    });

    socket.on("user:call", ({ to, offer }) => {
      io.to(to).emit("incoming:call", { from: socket.id, offer });
    });

    socket.on("call:accepted", ({ to, answer }) => {
      io.to(to).emit("call:accepted", { from: socket.id, answer });
    });

    socket.on("peer:nego:needed", ({ to, offer }) => {
      io.to(to).emit("peer:nego:needed", { from: socket.id, offer });
    });

    socket.on("peer:nego:done", ({ to, answer }) => {
      io.to(to).emit("peer:nego:final", { from: socket.id, answer });
    });

    socket.to(roomId).emit("room:join", {
      message: `${email} has joined the room`,
      email,
      roomId,
    });
  });

  socket.on("disconnect", () => {
    const email = socketidToEmailMap.get(socket.id);
    if (email) {
      console.log(`User disconnected: ${email} (${socket.id})`);
      emailToSocketMap.delete(email);
      socketidToEmailMap.delete(socket.id);
    } else {
      console.log(`User disconnected: undefined (${socket.id})`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
