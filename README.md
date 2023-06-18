![binb](https://raw.githubusercontent.com/ansgarprause/binb/master/public/img/binb-logo.png)

binb is a simple, realtime, multiplayer, competitive music listening game.

To play the game: [https://binb.fly.dev](https://binb.fly.dev)

## Installation

Unless previously installed you'll need the following packages:

- [Node.js](http://nodejs.org/)
- [Redis](http://redis.io/)

Please use their sites to get detailed installation instructions.

### Install binb

The first step is to install the dependencies:

```shell
npm install
```

Then you need to minify the assets:

```shell
npm run minify
```

Now make sure that the Redis server is running and load some sample tracks:

```shell
npm run import-data
```

Finally run `npm start` or `node app.js` to start the app.

Point your browser to `http://127.0.0.1:8138` and have fun!

#### Possible errors

Some package managers name the Node.js binary `nodejs`. In this case you'll get
the following error:

```shell
sh: node: command not found
```

To fix this issue, you can create a symbolic link:

```shell
sudo ln -s /usr/bin/nodejs /usr/bin/node
```

and try again.

## Browser compatibiliy

binb requires a browser that supports the WebSocket protocol.

Refer to this [table](http://caniuse.com/websockets) for details on
compatibility.

## Copyright and license

binb is released under the MIT license. See [LICENSE](LICENSE) for details.
