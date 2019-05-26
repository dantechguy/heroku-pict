// setup express
var express = require('express');

var app = express();

var server = app.listen(process.env.PORT || 3000);


// setup socket.io
const io = require('socket.io')(server);


// setup room class
var allRoomsFile = require('./allRooms.js')
var allRoomsClass = allRoomsFile.allRoomsClass;
var RoomClass = allRoomsFile.RoomClass;
var userLookUpTableClass = allRoomsFile.userLookUpTableClass;


// setup get responses
app.get('/', function(req, res) {
  let roomId = g.allRooms.generateUniqueRoomId();
  res.redirect('/' + roomId);
});

app.get('^/:roomId([0-9]{4})', function(req, res) {
  res.sendFile(__dirname + '/public/game.html');
});


// global variables
var g = {
  allRooms: new allRoomsClass(),
  userLookUpTable: new userLookUpTableClass()
}

function deleteRoomIfEmpty(roomId) {
  let roomObject = g.allRooms.getRoomWithId(roomId)
  if (roomObject.isEmpty()) {
    g.allRooms.deleteRoomWithId(roomId);
  };
};

function userHasDisconnected(socket) {
  let roomId = g.userLookUpTable.getUsersRoom(socket);
  let roomObject = g.allRooms.getRoomWithId(roomId)
  roomObject.removeUser(socket);
  g.userLookUpTable.removeUser(socket);
  deleteRoomIfEmpty(roomId);
};

function createNewRoom(roomId) {
  g.allRooms.createNewRoomWithId(roomId, io);
};

function addUserToExistingRoom(socket, roomId) {
  let roomObject = g.allRooms.getRoomWithId(roomId)
  roomObject.addUser(socket);
  g.userLookUpTable.addUserWithRoomId(socket, roomId);
};

function createNewUserAndNewRoom(socket, roomId) {
  createNewRoom(roomId);
  addUserToExistingRoom(socket, roomId);
};

function newUserHasConnected(socketAndRoomIdJson) {
  let socket = socketAndRoomIdJson.socket;
  let roomId = socketAndRoomIdJson.roomId;
  if (g.allRooms.roomExistsWithId(roomId)) {
    addUserToExistingRoom(socket, roomId);
  } else {
    createNewUserAndNewRoom(socket, roomId);
  };
  socket.join(roomId);
  socket.emit('generateLobby');
};

function userDoesNotExist(socket) {
  return !g.userLookUpTable.doesUserExist(socket);
};

function userExists(socket) {
  return g.userLookUpTable.doesUserExist(socket);
};

function getRoomObjectFromSocket(socket) {
  let roomId = g.userLookUpTable.getUsersRoom(socket);
  let roomObject = g.allRooms.getRoomWithId(roomId);
  return roomObject;
};

function getPlayerObjectFromSocket(socket) {
  let roomObject = getRoomObjectFromSocket(socket);
  let playerObject = roomObject.getUserObject(socket);
  return playerObject;
};

function escapeHtml(text) {
    var map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
  };

function playerReadyWithName(socket, name) {
  let playerObject = getPlayerObjectFromSocket(socket);
  playerObject.updateName(escapeHtml(name));
  playerObject.updateReadyStatus(true);
};

function ifRoomReadyStartGame(socket) {
  let roomObject = getRoomObjectFromSocket(socket);
  if (roomObject.isReady()) {
    startRoomGame(roomObject.roomId);
  };
};

function roomIsInLobby(roomId) {
  let roomObject = g.allRooms.getRoomWithId(roomId);
  return roomObject.stage === 'lobby';
}

function playerIsNotReady(socket) {
  let playerObject = getPlayerObjectFromSocket(socket);
  return !playerObject.ready;
};

function roomWaitingForPrompts(socket) {
  let roomObject = getRoomObjectFromSocket(socket);
  return roomObject.stage === 'prompts';
};

function roomWaitingForDrawings(socket) {
  let roomObject = getRoomObjectFromSocket(socket);
  return roomObject.stage === 'drawings';
};

function playerHasntSubmittedPrompt(socket) {
  let roomObject = getRoomObjectFromSocket(socket);
  let roomRoundDataObject = roomObject.roundData;
  return !roomRoundDataObject.playerHasSubmittedPrompt(socket);
};

function playerHasntSubmittedDrawing(socket) {
  let roomObject = getRoomObjectFromSocket(socket);
  let roomRoundDataObject = roomObject.roundData;
  return !roomRoundDataObject.playerHasSubmittedDrawing(socket);
};

function playerSubmitPrompt(socket, prompt) {
  let roomObject = getRoomObjectFromSocket(socket);
  let roomRoundDataObject = roomObject.roundData;
  roomRoundDataObject.playerSubmitPrompt(socket, prompt);
};

function playerSubmitDrawing(socket, drawingArray) {
  let roomObject = getRoomObjectFromSocket(socket);
  let roomRoundDataObject = roomObject.roundData;
  roomRoundDataObject.playerSubmitDrawing(socket, drawingArray);
};

function startRoomGame(roomId) {
  let roomObject = g.allRooms.getRoomWithId(roomId);
  roomObject.startGame();
};

function ifAllPlayersSubmittedPromptsDistributePrompts(socket) {
  let roomObject = getRoomObjectFromSocket(socket);
  let roomRoundDataObject = roomObject.roundData;
  if (roomRoundDataObject.allPlayersHaveSubmittedPrompts()) {
    shufflePlayersPromptsAndStartDrawing(roomObject.roomId);
  };
};

function ifAllPlayersSubmittedDrawingsDistributeDrawings(socket) {
  let roomObject = getRoomObjectFromSocket(socket);
  let roomRoundDataObject = roomObject.roundData;
  if (roomRoundDataObject.allPlayersHaveSubmittedDrawings()) {
    sendDrawingsAndGenerateInputs(roomObject.roomId);
  };
};

function shufflePlayersPromptsAndStartDrawing(roomId) {
  let roomObject = g.allRooms.getRoomWithId(roomId);
  let roomRoundDataObject = roomObject.roundData;
  roomRoundDataObject.applySentPromptsAndDrawings();
  roomObject.startDrawing();
};

function sendDrawingsAndGenerateInputs(roomId) {
  let roomObject = g.allRooms.getRoomWithId(roomId);
  let roomRoundDataObject = roomObject.roundData;
  roomRoundDataObject.applySentPromptsAndDrawings();
  roomObject.startGuessing();
};

io.on('connection', function(socket) {

  socket.on('newUser', function(roomId) {
    if (userDoesNotExist(socket)) { // two users with same socket id
      if (g.allRooms.roomExistsWithId(roomId)) {
        if (roomIsInLobby(roomId)) {
          let socketAndRoomIdJson = {
            socket: socket,
            roomId: roomId
          };
          newUserHasConnected(socketAndRoomIdJson);
        } else {
          socket.emit('errorMessage', 'This game has already started');
        }
      } else {
        let socketAndRoomIdJson = {
            socket: socket,
            roomId: roomId
          };
          newUserHasConnected(socketAndRoomIdJson);
      };
    } else { // socket id already exists
      socket.emit('errorMessage', 'You have already joined another game');
    };
  });

  socket.on('disconnect', function() { // when user leaves page
    if (userExists(socket)){
      userHasDisconnected(socket);
    };
  });

  socket.on('playerReadyWithName', function(data) {
    let roomId = getRoomObjectFromSocket(socket).roomId;
    if (playerIsNotReady(socket) && roomIsInLobby(roomId)) {
      playerReadyWithName(socket, data);
      ifRoomReadyStartGame(socket);
    };
  });

  socket.on('submitPrompt', function(prompt) {
    if (roomWaitingForPrompts(socket) && playerHasntSubmittedPrompt(socket)) {
      playerSubmitPrompt(socket, prompt);
      ifAllPlayersSubmittedPromptsDistributePrompts(socket);
    };
  });

  socket.on('submitDrawing', function(drawingArray) {
    if (roomWaitingForDrawings(socket) && playerHasntSubmittedDrawing(socket)) {
      playerSubmitDrawing(socket, drawingArray);
      ifAllPlayersSubmittedDrawingsDistributeDrawings(socket);
    };
  });

});

console.log('\nServer running!\n- - -');