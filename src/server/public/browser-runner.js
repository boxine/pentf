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

    var testCases = new Set();
    var ctx = [];
    function addTestCase(desc, fn, type) {
        testCases.add({
            id: ctx.join('>') + desc,
            desc,
            fn,
            type, // only | skip
        });
    }
    var test = function(desc, fn) {
        addTestCase(desc, fn, 'default');
    };
    test.only = function(desc, fn) {
        addTestCase(desc, fn, 'only');
    };
    test.skip = function(desc, fn) {
        addTestCase(desc, fn, 'skip');
    };
    var describe = function(desc, fn) {
        ctx.push(desc);
        fn();
    };

    window.test = test;
    window.it = test;
    window.describe = describe;
    window.suite = describe;

    // Tests will be collected after first tick
    Promise.resolve().then(function() {
        var json = [];
        testCases.forEach(function (testCase) {
            json.push({
                id: testCase.id,
                desc: testCase.desc,
                type: testCase.type,
            });
        });

        socket.send(JSON.stringify({
            type: 'add-tests',
            tests: json,
        }));
    });
})();
