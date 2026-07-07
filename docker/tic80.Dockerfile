FROM emscripten/emsdk:latest

# Ruby required by TIC-80 build scripts (CI uses 2.6)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ruby-full cmake ninja-build \
  && rm -rf /var/lib/apt/lists/*

ARG TIC80_REF=main
WORKDIR /src
RUN git clone --recursive --depth 1 --branch ${TIC80_REF} \
    https://github.com/nesbox/TIC-80.git .

COPY docker/tic80/ /embed/
RUN chmod +x /embed/apply-embed.sh && /embed/apply-embed.sh /src

WORKDIR /src/build
RUN emcmake cmake \
      -DBUILD_SDLGPU=Off \
      -DBUILD_STATIC=On \
      -DCMAKE_BUILD_TYPE=Release \
      -DBUILD_WITH_ALL=On \
      -DBUILD_PRO=On \
      -DTIC80_EMBED_API=On \
      -G Ninja \
      .. --fresh \
  && cmake --build . --parallel

COPY docker/export-tic80.sh /export-tic80.sh
RUN chmod +x /export-tic80.sh \
  && /export-tic80.sh /src/build/bin /export

VOLUME /export
CMD ["cp", "-r", "/export/.", "/out/"]
