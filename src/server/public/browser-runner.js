// This file should work down to IE11
(function () {
    var wsUrl = '';
    var files = [];

    function addScript(src) {
        var tag = document.createElement('script');
        document.body.appendChild(tag);
        tag.src = src;
    }

    for (var i = 0; i < files.length; i++) {
        addScript(files[i]);
    }

    // Create WebSocket connection.
    var socket = new WebSocket(wsUrl);

    // Connection opened
    socket.addEventListener('open', function (event) {
        socket.send('Hello Server!');
    });

    // Listen for messages
    socket.addEventListener('message', function (event) {
        console.log('Message from server ', event.data);
    });
})();
