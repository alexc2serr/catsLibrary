# 👩🏻‍💻 HTTP group project

## 🗺️ Overview

This group project statement is part of the course **Networks & Communications 2** of **Universidad San Jorge** of Zaragoza. All contents are original.

### 🧐 Intro

During our course, a key protocol we cover is the Hypertext Transfer Protocol (HTTP). HTTP is an application layer protocol within both the OSI and TCP/IP models, primarily used for transmitting hypermedia documents, such as HTML. It forms the foundation of data communication for the World Wide Web, operating on a client-server model that facilitates the fetching of resources, like web pages, from a server to a client, typically a web browser.

The objective of the group project is to achieve a deep understanding of the HTTP protocol. This includes everything from its implementation at the lowest level to advanced details such as caching, authentication, or the implementation of REST APIs.

In this group project, we aim to implement a simplified version of the HTTP protocol from scratch. Students are encouraged to select the programming language and/or framework of their choice, as well as any development tools they deem most appropriate for the task. The primary goal of this exercise is to offer practical experience in building network applications and to deepen the understanding of HTTP's role and functionality in web development.

### 🧰 Project outcome

The project involves developing from scratch, using only transport layer network libraries, a basic HTTP client and server. This client and server should operate between themselves but also, by adhering to the protocol standard, interoperate with any other "real" client or server.

Unless the optional GUI feature is implemented, the client will be a command-line program, more or less interactive depending on the optional features decided to be implemented. In summary, a program capable of launching HTTP messages and processing the response messages to these requests is expected.

On the other hand, the HTTP server will be a program capable of receiving HTTP requests and reacting to them, updating its internal state and responding with various web objects as necessary. The HTTP server is a program that must always be available to receive requests, whether from one or more clients, sequentially or concurrently, and whether some are unsuccessful and others are successful.

Both the client and server can be developed in the programming language and/or framework that the group decides. The only technological restriction is that the use of any network library from an OSI layer higher than the transport layer is not allowed. That is, libraries that interact with TCP sockets can (and should) be used, but the use of libraries that work directly with HTTP requests, either sending or receiving them, is not allowed. The task consists, in fact, of achieving the implementation of such a library. Some examples of the type of libraries not allowed would be Axios or Express in the NodeJS ecosystem, SpringBoot or OkHttp in the Java ecosystem, or libcurl in the C++ ecosystem.

The target protocol version is **HTTP/1.1**, as defined in [RFC 9112 (HTTP/1.1)](https://www.rfc-editor.org/rfc/rfc9112) and [RFC 9110 (HTTP Semantics)](https://www.rfc-editor.org/rfc/rfc9110). You are not expected to implement the full specification, but your implementation must be compliant enough to achieve **basic interoperability**: your client should be able to communicate with real-world HTTP servers (e.g., `example.com`), and your server should be able to respond correctly to standard tools like `curl` or a web browser. This interoperability is a key evaluation criterion.

The ideal programming language is the one with which the group is most familiar. However, due to the appropriate level of abstraction it offers, NodeJS is suggested only as a recommendation.

### 🚚 Delivery

The project delivery consists of two elements:

- **Technical report** (max. 10 pages): explaining in as much detail as desired the most important decisions made, challenges overcome, group task distribution, and work methodology followed. The report must be submitted through the PDU and must include a link to the code repository.
- **Code repository**: the repository in which the project has been developed, with its original change history and version control. I must be added as a collaborator to the repository (`@pitazzo` on GitHub) before the delivery deadline.

### 🔎 Evaluation

The project evaluation will be based on a maximum possible grade chosen by the group itself. This grade will be determined by the optional features implemented. The score that these features will add varies depending on the number of group members, between four and six, with the recommended option being to form groups of five students. In addition, there will be a series of mandatory features that must be implemented in any case to pass the project.

The evaluation will be based on the correctness of the technical report and the code available in the latest version of the code repository, as well as a live demo that the group will have to perform. During this demo, the professor may discretionally ask students any questions deemed appropriate.

- **Report and repository deadline**: **May 13, 2026**. Both must be delivered by this date.
- **Live demos**: **May 18 and 20, 2026**. Each group will have 10 minutes to present their project and answer questions.

Original, very high-quality code is expected, following good practices, appropriate design patterns, good formatting, and good naming. This will be especially taken into account during the evaluation.

#### 👥 Individual grade adjustment (peer review)

While the project receives a single group grade, **individual grades may vary** based on a peer review process. After the delivery, each team member will anonymously rate the contribution of every other member (and themselves). These ratings will be used to compute an individual adjustment factor, clamped to the range **x0.8 to x1.2**, which will be applied to the group grade.

This means that a student who contributes significantly more than average can receive up to 120% of the group grade, while a student who contributes less may receive as low as 80%.

The use of generative AI tools (ChatGPT, Claude, Copilot, etc.) is **allowed and encouraged** for research, debugging, understanding concepts, and generating boilerplate code. However:

- You **must document** in the technical report which tools you used, for what purpose, and how they helped your workflow.
- During the live demo, every team member must be able to **explain any design decision and any relevant line of code** in the project. If a student cannot explain something they wrote (or that an AI tool wrote for them), it will negatively impact their individual grade.
- Using AI without disclosure remains grounds for a grade of **"0"**.

## 🛂 Mandatory features

**All** of the following features are mandatory for **all** groups, regardless of their number of members. The maximum score they can contribute will vary based on the number of members as detailed in the attached table.

For proper project development, it is essential to implement the mandatory features **before** starting with the optional ones.

### 🚢 HTTP Client

The program that interacts as an HTTP client must be able to execute the following features:

- Send HTTP requests, in a way that:
  - It is possible to choose the URL to which the request will be sent
  - Use any available HTTP verb in the request (GET, HEAD, POST, PUT, DELETE)
  - Automatically add the necessary headers to the request so that it can be processed correctly
  - Add any other arbitrary header desired by the user
  - Specify the body of the request
- Receive and display on screen the response message of the sent request
- Inform about the request status
- Be able to send successive requests, i.e., to send a second request it is not necessary to restart the program

### 🏗️ HTTP Server with RESTful API

The HTTP server must expose a **RESTful API** following standard conventions. REST (Representational State Transfer) is an architectural style for networked applications, originally described in [Roy Fielding's dissertation (Chapter 5)](https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm). The HTTP methods and status codes used below are defined in [RFC 9110 (HTTP Semantics)](https://www.rfc-editor.org/rfc/rfc9110). It must be able to do the following:

- Serve at least one **static content** endpoint (e.g., a static HTML file at `/index.html`)
- Expose a **REST resource** with the following endpoints:
  - `GET /resource` returns the list of all resources (`200 OK`)
  - `GET /resource/:id` returns a single resource by its identifier (`200 OK`, or `404 Not Found`)
  - `POST /resource` creates a new resource from the JSON body (`201 Created`)
  - `PUT /resource/:id` updates an existing resource (`200 OK`, or `404 Not Found`)
  - `DELETE /resource/:id` deletes a resource (`204 No Content`, or `404 Not Found`)
- Use **JSON** (`Content-Type: application/json`) for both request and response bodies in all API endpoints
- Return appropriate **HTTP status codes**: `200`, `201`, `204`, `400 Bad Request` (malformed body), `404`, `405 Method Not Allowed` (wrong verb on a valid path)
- Attend to multiple requests concurrently
- Offer minimal configuration that allows choosing on which port the server starts
- It is not necessary for the resources to be persisted; they can be managed in memory

#### 💬 Clarification on endpoints and resources

The nature of the resources managed by the server is up to the group's discretion, as well as the static contents it serves. For example, a group that likes kittens could focus its server on this theme and:

- Serve a simple HTML web page about a cat shelter at `/adoption.html`
- Manage kitten resources (e.g., `{"name": "Hercules", "breed": "European", "age": 3}`) through a REST API:
  - `GET /cats` returns all cats
  - `GET /cats/1` returns the cat with id 1
  - `POST /cats` registers a new cat for adoption
  - `PUT /cats/1` modifies an existing cat's data
  - `DELETE /cats/1` removes a cat when adopted

#### 🌐 Reference server

A fully working reference implementation of the mandatory server features is available at:

```
http://usjlabs.xyz/http-project-demo/
```

You can explore it with `curl`, [Bruno](https://www.usebruno.com), or your browser to understand the expected behavior before writing your own. Try these:

```bash
# Static page
curl http://usjlabs.xyz/http-project-demo/

# List all cats
curl http://usjlabs.xyz/http-project-demo/cats

# Get a single cat
curl http://usjlabs.xyz/http-project-demo/cats/1

# Create a cat
curl -X POST http://usjlabs.xyz/http-project-demo/cats \
  -H "Content-Type: application/json" \
  -d '{"name": "Neko", "breed": "Japanese Bobtail", "age": 2}'

# Update a cat
curl -X PUT http://usjlabs.xyz/http-project-demo/cats/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Hercules", "breed": "European", "age": 4}'

# Delete a cat
curl -X DELETE http://usjlabs.xyz/http-project-demo/cats/1
```

> **Note:** This server is built with Express (a high-level HTTP framework) and is meant as a behavioral reference only. Your implementation must use raw TCP sockets as described in the project requirements. Data resets periodically.

## 🚀 Optional features

The following features are optional and allow increasing the maximum possible grade that the student can opt for. **Always** the basic features must be finished before starting with the advanced ones.

### 🔑 Authentication with API key

**Difficulty:** Low

Implement basic authentication based on an API key. It consists of making the HTTP server only accept HTTP requests from those clients that include a key in a specific header of their requests. If not done, those requests must be rejected with the appropriate error code. The API key must be configurable in both client and server without the need to recompile either program.

### 🔐 Authentication with login flow

**Difficulty:** Medium

Implement a complete authentication flow. In this case, the server will have to manage (create, modify, delete) a series of `User` resources storing their username and password. **Passwords must be stored securely**, never in plaintext. The server will have to support a login endpoint where the client can pass its username and password to obtain a session token in return. Tokens should have an **expiration time** after which they are no longer valid. Subsequent client requests can authenticate by including this token in a header, being rejected otherwise.wh

### 📸 Sending and receiving multimedia files

**Difficulty:** Medium

Enable the possibility for the client and server, following the MIME standard, to send and receive multimedia content such as images. For example, resources may now include PNG images.

### 🔒 TLS (basic)

**Difficulty:** Medium

Add TLS support so that traffic between client and server travels encrypted over the TCP connection, using **the TLS capabilities built into your language's standard library** (e.g., the `tls` module in Node.js, `SSLSocket` in Java, or the `ssl` module in Python).

To complete this feature you must:

- Generate a local Certificate Authority (CA) and issue a self-signed server certificate using tools like `openssl` or [`mkcert`](https://github.com/FiloSottile/mkcert)
- Configure the server to use this certificate and private key
- Configure the client to trust the local CA and establish a TLS connection
- Demonstrate that the connection is actually encrypted (e.g., capture traffic with [Wireshark](https://www.wireshark.org/) and show that the payload is not readable in plaintext)

### ☢️ TLS (advanced)

**Difficulty:** Very high

Implement the TLS handshake **manually over a raw TCP socket**, without using any TLS library. This means handling certificate exchange, key agreement (e.g., Diffie-Hellman or ECDHE), and symmetric encryption of application data yourself. This is a challenging but deeply educational feature. Groups attempting this feature should discuss the scope with me beforehand.

### 📓 Logging

**Difficulty:** Low

Write in a file all the activity that occurs and the requests received on the server, including different levels of logging, timestamps, etc.

### 🧪 Automated Testing

**Difficulty:** Medium

Use automated testing tools such as Jest or JUnit to automatically test the endpoints exposed by the server. For example, creating a series of cats in `/cats` and checking that these cats can then be recovered.

### ☁️ Deployment on a real server

**Difficulty:** Low

Upload the HTTP server to a publicly available machine and have it function from there. Solutions such as virtual machines or serverless environments can be used.

### ⚙️ Refactor with HTTP framework

**Difficulty:** Low

Implement a second version of the HTTP server using high-level HTTP libraries such as Express this time. Demonstrate that it is capable of interoperating with the original client.

### 💾 Conditional GET with cache

**Difficulty:** Medium

Implement a mechanism of conditional GET that allows storing resources in the client's local cache and reloading them only if they have been modified, thereby reducing traffic between client and server.

The implementation should support at least one of these validation strategies:
- **Time-based**: `Last-Modified` / `If-Modified-Since` headers
- **Content-based**: `ETag` / `If-None-Match` headers

When the resource has not changed, the server should respond with `304 Not Modified` and no body.

### 🎨 GUI for the client

**Difficulty:** Medium

Add a graphical user interface to the client, so that requests can be visually configured before being sent, as well as their responses.

### 🍪 Cookies

**Difficulty:** Low

Implement cookie support in both client and server. The server sets cookies using the `Set-Cookie` response header, and the client stores them and automatically sends them back via the `Cookie` request header in all subsequent requests, transparently to the user.

The implementation should support at least:
- Setting cookies with a name and value
- Cookie expiration (`Expires` or `Max-Age`)
- Path scoping (`Path` attribute) so that cookies are only sent for matching request paths

### 🎰 Advanced CRUD

**Difficulty:** Low

Complicate the basic CRUD proposed by managing more resources and establishing relationships between them, nesting, etc.

### 🔄 HTTP/1.1 compliance

**Difficulty:** Medium

Improve the protocol implementation to support key HTTP/1.1 features beyond the basics:

- **Persistent connections**: support `Connection: keep-alive` so that multiple requests can be sent over a single TCP socket without reconnecting each time. You must demonstrate this with Wireshark, showing that a single TCP connection carries multiple request/response exchanges
- **Correct `Content-Length`**: always include an accurate `Content-Length` header in every response
- **Chunked transfer encoding**: support `Transfer-Encoding: chunked` for responses where the total size is not known in advance

This feature deepens understanding of how real HTTP implementations manage connections efficiently.

### 🔗 Middleware / interceptors

**Difficulty:** Low

Implement a **middleware chain** in the server, so that incoming requests pass through a series of processing functions before reaching the final route handler. Each middleware can inspect or modify the request and response, or short-circuit the chain (e.g., rejecting unauthorized requests).

Demonstrate the middleware system with at least **two middlewares** (e.g., a request logger and an authentication check). This is a classical feature in frameworks such as Express, Spring, or ASP.NET.

### 🧠 Anything else

**Difficulty:** ???

It is possible to propose any other optional features to the professor. A score will be agreed upon with the group of students based on their number of members.

## 📝 Grading of features

| Feature                      | 4 students | 5 students | 6 students |
| ---------------------------- | ---------- | ---------- | ---------- |
| Mandatory features           | +7 pts.    | +6 pts.    | +5 pts.    |
| API key                      | +0.8 pts.  | +0.6 pts.  | +0.5 pts.  |
| Login flow                   | +2.5 pts.  | +2 pts.    | +1.8 pts.  |
| Multimedia messages          | +1.5 pts.  | +1.2 pts.  | +1 pts.    |
| TLS (basic)                  | +1.5 pts.  | +1.2 pts.  | +1 pts.    |
| TLS (advanced)               | +2.5 pts.  | +2 pts.    | +1.8 pts.  |
| Logging                      | +0.8 pts.  | +0.6 pts.  | +0.5 pts.  |
| Automated testing            | +1.5 pts.  | +1.2 pts.  | +1 pts.    |
| Real server deployment       | +0.8 pts.  | +0.6 pts.  | +0.5 pts.  |
| Refactor with HTTP framework | +1.5 pts.  | +1.2 pts.  | +1 pts.    |
| Conditional GET              | +1.5 pts.  | +1.2 pts.  | +1 pts.    |
| Client GUI                   | +1.5 pts.  | +1.2 pts.  | +1 pts.    |
| Cookies                      | +0.8 pts.  | +0.6 pts.  | +0.5 pts.  |
| Advanced CRUD                | +0.8 pts.  | +0.6 pts.  | +0.5 pts.  |
| HTTP/1.1 compliance          | +1.5 pts.  | +1.2 pts.  | +1 pts.    |
| Middleware / interceptors    | +0.8 pts.  | +0.6 pts.  | +0.5 pts.  |

## 📊 Grading rubric

The final grade will be determined by applying the percentage of achievement to the group’s maximum achievable score, as defined in the rubric below. Scores exceeding 10 will be capped at 10.

| Evaluation Area       | Criteria                                                | Max Points (%) |
|-----------------------|----------------------------------------------------------|----------------|
| **Technical Report** (30%) | Clarity and structure of the document                      | 6%              |
|                       | Technical depth (decisions, architecture, challenges)     | 10%             |
|                       | Work distribution and methodology                         | 6%              |
|                       | Critical reflection / future improvements                 | 4%              |
|                       | Transparency on AI tool usage                             | 4%              |
| **Live Presentation** (30%) | Clarity and understanding of the project               | 10%             |
|                       | Working demo of client-server interaction                 | 10%             |
|                       | Correct answers to technical questions                    | 6%              |
|                       | Time management (within 10 minutes)                       | 4%              |
| **Code Quality** (40%) | Implementation of required/optional features              | 12%             |
|                       | Protocol correctness (header parsing, `\r\n`, Content-Length, status codes) | 8% |
|                       | Good practices: naming, modularity, formatting            | 8%             |
|                       | Technical soundness (concurrency, error handling, sockets)| 8%             |
|                       | Clean version control history                             | 4%              |

## 🔁 Proposed work plan for mandatory features

The project is broad and can be challenging, but it is entirely solvable by students of our degree and represents a great opportunity to learn new things. For those groups that feel somewhat overwhelmed and unclear on how to start the project, this work structure is proposed:

1. Develop a "client library" that allows HTTP requests to be made in a simple and clean way, without getting into implementation details. That is, to create a series of functions that can be invoked in a way similar to this:

   ```
   const response = myClientLib.request('GET', 'http://localhost/cats, headers: {'key': 123}, body: {}')
   ```

   To validate that this first step has been successfully completed, tools like [Beeceptor](https://beeceptor.com) can be very useful.

2. Define a "server library," analogous to the "client library." In this case, we need to achieve a suite of functions that allow us to abstract to a certain extent from the reception of requests. For example, something along the lines of:

   ```
   myServerLib.on('get', '/cats', {
       ...
   });
   ```

   This part can be easily validated with tools like [Bruno](https://www.usebruno.com) or simply [cURL](https://curl.se).

3. Implement the HTTP client as an interactive CLI that uses the library from the first step to be able to launch dynamic requests. Again, Beeceptor is an excellent ally for debugging.

4. Enable in our HTTP server, using our "server library," a first endpoint that statically returns an HTML file read from disk.

5. Implement the REST API by adding the CRUD endpoints (`GET`, `POST`, `PUT`, `DELETE`) with JSON request/response bodies and proper status codes. Use simple in-memory persistence (e.g., a `Map` or dictionary).

6. Address error cases: return `400` for malformed requests, `404` for missing resources, `405` for unsupported methods on valid paths.

### Recommended debugging tools

Throughout development, these tools will help you test and debug your implementation:

- **[cURL](https://curl.se)**: send HTTP requests from the terminal. Essential for quick endpoint testing.
- **[httpie](https://httpie.io)**: a more user-friendly alternative to cURL with colored JSON output.
- **Wireshark**: you already know it well from previous courses. Use it here to verify your HTTP messages are correctly formatted at the byte level, and for the TLS feature to confirm encryption.
- **[Beeceptor](https://beeceptor.com)**: create mock HTTP endpoints to test your client against before your server is ready.
- **[Bruno](https://www.usebruno.com)**: graphical tool for crafting and inspecting HTTP requests.
