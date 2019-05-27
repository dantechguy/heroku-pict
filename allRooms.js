class allRoomsClass {

  constructor() {
    this.allRooms = {};
  }

  roomExistsWithId(roomId) {
    let allRoomIds = Object.keys(this.allRooms);
    return allRoomIds.includes(roomId);
  }

  getRoomWithId(roomId) {
    return this.allRooms[roomId];
  }

  generateUniqueRoomId() {
    let allTakenRoomIds = Object.keys(this.allRooms);
    let currentTrialId = this.generateNewRoomId();
    while (allTakenRoomIds.includes(currentTrialId)) {
      currentTrialId = this.generateNewRoomId();
    };
    return currentTrialId;
  }

  generateNewRoomId() {
    let digitOne = this.generateRandomStringUnit();
    let digitTwo = this.generateRandomStringUnit();
    let digitThree = this.generateRandomStringUnit();
    let digitFour = this.generateRandomStringUnit();
    return digitOne + digitTwo + digitThree + digitFour;
  }

  generateRandomStringUnit() {
    return Math.floor(Math.random()*10).toString(10);
  }

  createNewRoomWithId(roomId, io) {
    let roomObject = new roomClass(roomId, io);
    this.allRooms[roomId] = roomObject;
  }

  deleteRoomWithId(roomId) {
    delete this.allRooms[roomId];
  }

}






class roomClass {

  constructor(roomId, io) {
    this.io = io;
    this.roomId = roomId;
    this.userObjects = {};
    this.stage = 'lobby';
    // lobby, prompts, drawings
    this.roundData = new roomRoundsData(this);
    
  }

  startGame() {
    this.roundData.roundsLeft = Object.keys(this.userObjects).length + 1;
    this.stage = 'prompts';
    this.roundData.newRound();
    this.io.to(this.roomId).emit('generateInitialPrompt');
  }

  startDrawing() {
    this.stage = 'drawings';
    this.sendDrawingMessageAndPromptToAllPlayers();
    
  }

  startGuessing() {
    this.stage = 'prompts';
    this.sendDrawingsAndGenerateInput();
    this.roundData.newRound();
  }

  sendWhoIsStillDrawing() {
    let playerNamesStillDrawingArray = this.roundData.playerNamesStillDrawing();
    let playerSocketsSubmittedDrawings = this.roundData.playerSocketsSubmittedDrawings();
    for (let i in playerSocketsSubmittedDrawings) {
      let userSocket = playerSocketsSubmittedDrawings[i];
      userSocket.emit('generateUsersStillDrawing', playerNamesStillDrawingArray);
    };

  }

  isEmpty() {
    return Object.keys(this.userObjects).length === 0;
  }

  hasMoreThanOnePlayer() {
    return Object.keys(this.userObjects).length > 1;
  }

  sendDrawingsAndGenerateInput() {
    for (let userId in this.userObjects) {
      let userObject = this.userObjects[userId];
      let userSocket = userObject.userSocket;

      let drawingArrayForUser = this.roundData.getUserDrawing(userSocket);
      userObject.userSocket.emit('receiveDrawingAndStartGuessing', drawingArrayForUser);
    };
  }

  sendDrawingMessageAndPromptToAllPlayers() {
    for (let userId in this.userObjects) {
      let userObject = this.userObjects[userId];
      let userSocket = userObject.userSocket;

      let promptForUser = this.roundData.getUserPrompt(userSocket);
      userObject.userSocket.emit('receivePromptAndStartDrawing', promptForUser);
    };
  }

  isReady() {
    for (let userId in this.userObjects) {
      let currentObject = this.userObjects[userId];
      if (!currentObject.ready) {
        return false;
      };
    };
    return true;
  }

  addUser(userSocket) {
    let userSocketId = userSocket.id;
    this.userObjects[userSocketId] = new UserData(userSocket);
  }

  removeUser(userSocket) {
    let userSocketId = userSocket.id;
    delete this.userObjects[userSocketId];
  }

  getUserObject(userSocket) {
    let userSocketId = userSocket.id;
    let userObject = this.userObjects[userSocketId];
    return userObject;
  }

  getUserNameFromId(userId) {
    let userObject = this.userObjects[userId];
    return userObject.name;
  }

  finishGame() {
    let chainReactionData = this.generateFinalChainReactionData();
    this.sendChainReactionDataToUsers(chainReactionData);
  }

  sendChainReactionDataToUsers(chainReactionData) {
    for (let userId in this.userObjects) {
      let userObject = this.userObjects[userId];
      let userSocket = userObject.userSocket;

      let usersChainReactionData = chainReactionData[userId]
      userObject.userSocket.emit('generateChainReaction', usersChainReactionData);
    };
  }

  generateFinalChainReactionData() {
    let chainReactionData = {};

    for (let userId in this.userObjects) {
      let firstRoundData = this.roundData.getRoundData(0);

      let authorName = this.getUserNameFromId(userId);
      let guess = firstRoundData[userId].submittedPrompt;
      let artistId = firstRoundData[userId].submittedPromptTo;
      let artistName = this.getUserNameFromId(artistId);
      let drawingArray = firstRoundData[artistId].submittedDrawing;

      chainReactionData[userId] = 
      [
        {
          authorName: authorName,
          guess: guess,
          artistId: artistId,
          artistName: artistName,
          drawingArray: drawingArray
        }
      ];
    };

    for (let previousRoundNumberString in this.roundData.roundData.slice(1)) {
      let previousRoundNumber = parseInt(previousRoundNumberString);
      let roundNumber = previousRoundNumber + 1;
      let previousRoundData = this.roundData.getRoundData(previousRoundNumber);
      let roundData = this.roundData.getRoundData(roundNumber);

      for (let userId in this.userObjects) {
        let previousChainData = chainReactionData[userId][previousRoundNumber];
        let previousArtistId = previousChainData.artistId;

        let authorId = previousRoundData[previousArtistId].submittedDrawingTo;
        let authorName = this.getUserNameFromId(authorId);
        let guess = roundData[authorId].submittedPrompt;
        let artistId = roundData[authorId].submittedPromptTo;
        let artistName = this.getUserNameFromId(artistId);
        let drawingArray = roundData[artistId].submittedDrawing;

        chainReactionData[userId].push(
        {
          authorName: authorName,
          guess: guess,
          artistId: artistId,
          artistName: artistName,
          drawingArray: drawingArray
        });
      };
    };
    console.log(chainReactionData);
    return chainReactionData;

  }

}






class UserData {
  constructor(userSocket) {
    this.userSocket = userSocket;
    this.ready = false;
    this.name = '';
  }

  updateName(name) {
    this.name = name;
  }

  updateReadyStatus(status) {
    this.ready = status;
  }

}






class roomRoundsData {
  constructor(roomObject) {
    this.roomObject = roomObject;
    this.roundData = [];
    this.roundsLeft;
  }

  playerNamesStillDrawing() {
    let stillDrawingArray = [];
    for (let userId in this.roomObject.userObjects) {
      if (!this.playerHasSubmittedDrawing({id:userId})) {
        let userName = this.roomObject.getUserNameFromId(userId);
        stillDrawingArray.push(userName);
      };
    };
    return stillDrawingArray;
  }

  playerSocketsSubmittedDrawings() {
    let submittedDrawingsArray = [];
    for (let userId in this.roomObject.userObjects) {
      if (this.playerHasSubmittedDrawing({id:userId})) {
        let userObject = this.roomObject.userObjects[userId]
        let userSocket = userObject.userSocket;
        console.log(this.roomObject.userObjects)
        submittedDrawingsArray.push(userSocket);
      };
    };
    return submittedDrawingsArray;
  }

  getRoundData(roundNumber) {
    return this.roundData[roundNumber];
  }

  getUserPrompt(userSocket) {
    let finalRound = this.finalRound();
    return finalRound[userSocket.id].receivedPrompt;
  }

  getUserDrawing(userSocket) {
    let finalRound = this.finalRound();
    return finalRound[userSocket.id].receivedDrawing;
  }

  allPlayersHaveSubmittedPrompts() {
    for (let userId in this.roomObject.userObjects) {
      let userSocket = this.roomObject.userObjects[userId].userSocket;
      if (!this.playerHasSubmittedPrompt(userSocket)) {
        return false;
      };
    };
    return true;
  }

  allPlayersHaveSubmittedDrawings() {
    for (let userId in this.roomObject.userObjects) {
      let userSocket = this.roomObject.userObjects[userId].userSocket;
      if (!this.playerHasSubmittedDrawing(userSocket)) {
        return false;
      };
    };
    return true;
  }

  playerHasSubmittedPrompt(userSocket) {
    let finalRound = this.finalRound();
    return finalRound[userSocket.id].submittedPrompt !== null;
  }

  playerHasSubmittedDrawing(userSocket) {
    let finalRound = this.finalRound();
    return finalRound[userSocket.id].submittedDrawing !== null;
  }

  playerSubmitPrompt(userSocket, prompt) {
    let finalRound = this.finalRound();
    finalRound[userSocket.id].submittedPrompt = prompt;
  }

  playerSubmitDrawing(userSocket, drawingArray) { // should be to the new round
    let finalRound = this.finalRound();
    finalRound[userSocket.id].submittedDrawing = drawingArray;
  }

  newRound() {
    this.roundsLeft -= 1;
    if (this.roundsLeft === 0) {
      this.roomObject.finishGame();
    } else {
      this.roundData.push(this.generateNewRoundJson());
      this.assignPromptAndDrawingSenders();
    };
  }

  generateNewRoundJson() {
    let roundJson = {};
    for (let userId in this.roomObject.userObjects) {
      
      roundJson[userId] = {
        submittedPrompt: null, 
        submittedPromptTo: null,
        receivedPrompt: null, 
        receivedPromptFrom: null, 
        submittedDrawing: null, 
        submittedDrawingTo: null, 
        receivedDrawing: null,
        receivedDrawingFrom: null
      };
    };
    return roundJson;
  }

  finalRound() {
    return this.roundData.slice(-1)[0];
  }

  applySentPromptsAndDrawings() {
    let finalRound = this.finalRound();
    for (let userId in finalRound) {
      let sendingUserJson = finalRound[userId];

      let receivingPromptUserId = sendingUserJson.submittedPromptTo;
      let receivingPromptUserJson = finalRound[receivingPromptUserId];
      let sentPrompt = sendingUserJson.submittedPrompt;
      receivingPromptUserJson.receivedPrompt = sentPrompt;

      let receivingDrawingUserId = sendingUserJson.submittedDrawingTo;
      let receivingDrawingUserJson = finalRound[receivingDrawingUserId];
      let sentDrawing = sendingUserJson.submittedDrawing;
      receivingDrawingUserJson.receivedDrawing = sentDrawing;
    }
  }

  assignPromptAndDrawingSenders() { // sets submittedPromptTo, receivedPromptFrom, submittedDrawingTo, receivedDrawingFrom
    let finalRound = this.finalRound();
    let userIds = Object.keys(this.roomObject.userObjects);

    let promptSenders = shuffle(userIds);
    let sendPromptTo = promptSenders.slice();
    sendPromptTo.push(sendPromptTo.shift());
    let drawingSenders = shuffle(userIds);
    let sendDrawingTo = drawingSenders.slice();
    sendDrawingTo.push(sendDrawingTo.shift());


    for (let i in promptSenders) {
      let sender = promptSenders[i];
      let sentTo = sendPromptTo[i];

      finalRound[sender].submittedPromptTo = sentTo;
      finalRound[sentTo].receivedPromptFrom = sender;
    };

    for (let i in drawingSenders) {
      let sender = drawingSenders[i];
      let sentTo = sendDrawingTo[i];

      finalRound[sender].submittedDrawingTo = sentTo;
      finalRound[sentTo].receivedDrawingFrom = sender;
    };
  }

}




function twoArraysHaveOneEqualValue(array1, array2) {
  let minLength = Math.min(array1.length, array2.length);
  for (let i=0; i<minLength; i++) {
    if (array1[i] === array2[i]) {
      return true;
    };
  };
  return false;
};

function shuffle(array) {
  var m, t, i, trialArray=array.slice();

  while (twoArraysHaveOneEqualValue(array, trialArray)) {
    trialArray = array.slice()
    m = trialArray.length;

    // While there remain elements to shuffle…
    while (m) {

      // Pick a remaining element…
      i = Math.floor(Math.random() * m--);

      // And swap it with the current element.
      t = trialArray[m];
      trialArray[m] = trialArray[i];
      trialArray[i] = t;
    }
  }

  return trialArray;
}






class userLookUpTableClass {

  constructor() {
    this.allUsers = {};
  }

  addUserWithRoomId(userSocket, roomId) {
    this.allUsers[userSocket.id] = roomId;
  }

  getUsersRoom(userSocket) {
    let roomId = this.allUsers[userSocket.id];
    return roomId;
  }

  removeUser(userSocket) {
    delete this.allUsers[userSocket.id];
  }

  doesUserExist(userSocket) {
    let allUserSocketIds = Object.keys(this.allUsers);
    return allUserSocketIds.includes(userSocket.id);
  }

}






module.exports = {
  allRoomsClass: allRoomsClass,
  roomClass: roomClass,
  userLookUpTableClass: userLookUpTableClass
}