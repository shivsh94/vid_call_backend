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
const roomToUsersMap = new Map(); // Track all users in each room

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("room:join", ({ name, roomId }) => {
    if (!name || !roomId) {
      console.error("Missing name or roomId:", { name, roomId });
      return;
    }

    console.log(`User ${name} is joining room ${roomId}`);

    emailToSocketMap.set(name, socket.id);
    socketidToEmailMap.set(socket.id, name);
    
    // Get existing users in the room
    const existingUsers = roomToUsersMap.get(roomId) || [];
    
    // Notify the new user about all existing users
    io.to(socket.id).emit("room:users", { users: existingUsers });

    // Notify all existing users about the new user
    existingUsers.forEach((user) => {
      io.to(user.id).emit("user:joined", { 
        email: name, 
        id: socket.id 
      });
    });

    socket.join(roomId);
    
    // Add new user to room tracking
    existingUsers.push({ email: name, id: socket.id });
    roomToUsersMap.set(roomId, existingUsers);
    
    // Store roomId in socket for cleanup
    socket.roomId = roomId;

    io.to(socket.id).emit("room:join", {
      message: `You joined room ${roomId}`,
      roomId,
      name,
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

    socket.on("ice:candidate", ({ to, candidate }) => {
      io.to(to).emit("ice:candidate", { from: socket.id, candidate });
    });

    socket.to(roomId).emit("room:join", {
      message: `${name} has joined the room`,
      name,
      roomId,
    });
  });

  socket.on("disconnect", () => {
    const name = socketidToEmailMap.get(socket.id);
    const roomId = socket.roomId;
    
    if (name) {
      console.log(`User disconnected: ${name} (${socket.id})`);
      emailToSocketMap.delete(name);
      socketidToEmailMap.delete(socket.id);
      
      // Remove user from room tracking
      if (roomId) {
        const users = roomToUsersMap.get(roomId) || [];
        const updatedUsers = users.filter((user) => user.id !== socket.id);
        
        if (updatedUsers.length > 0) {
          roomToUsersMap.set(roomId, updatedUsers);
        } else {
          roomToUsersMap.delete(roomId);
        }
        
        // Notify remaining users
        updatedUsers.forEach((user) => {
          io.to(user.id).emit("user:left", { 
            email: name, 
            id: socket.id 
          });
        });
      }
    } else {
      console.log(`User disconnected: undefined (${socket.id})`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
