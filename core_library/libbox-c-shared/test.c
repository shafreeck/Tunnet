#include "libbox.h"
#include <stdio.h>

int main() {
    printf("Calling LibboxHello...\n");
    char* msg = LibboxHello();
    printf("Received: %s\n", msg);
    return 0;
}
