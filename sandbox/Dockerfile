FROM gcc:13-bookworm@sha256:8c0fe724784c6d617cb582f79ddaf5dd2233aaba2fb7a14e0b9d03348fea8088
COPY native/runner.c /tmp/runner.c
RUN gcc -O2 -Wall -Wextra -Werror /tmp/runner.c -o /usr/local/bin/leetkob-runner \
    && rm /tmp/runner.c \
    && mkdir /readonly-probe && chmod 0777 /readonly-probe
USER 1000:1000
WORKDIR /work
ENTRYPOINT ["/usr/local/bin/leetkob-runner"]
