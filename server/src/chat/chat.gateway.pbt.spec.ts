import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatStore } from '../shared/stores/chat.store';

function createMockSocket(id = 'socket1') {
  return {
    id,
    emit: vi.fn(),
    broadcast: { emit: vi.fn() },
    join: vi.fn(),
    leave: vi.fn(),
    to: vi.fn().mockReturnThis(),
  } as any;
}

/**
 * Property 10: Socket.IO event routing đúng handler
 * **Validates: Requirements 5.1, 5.2, 5.3**
 *
 * For ANY of the 11 recognized Socket.IO events, the gateway routes to the
 * correct ChatService method. Verify by mocking ChatService and checking
 * which method gets called.
 */
describe('ChatGateway - Property Tests', () => {
  let gateway: ChatGateway;
  let chatService: ChatService;

  beforeEach(() => {
    const store = new ChatStore();
    chatService = new ChatService(store);
    gateway = new ChatGateway(chatService);

    // Mock all service methods
    vi.spyOn(chatService, 'register').mockImplementation(() => {});
    vi.spyOn(chatService, 'broadcastMessage').mockImplementation(() => {});
    vi.spyOn(chatService, 'privateMessage').mockImplementation(() => {});
    vi.spyOn(chatService, 'groupMessage').mockImplementation(() => {});
    vi.spyOn(chatService, 'createGroup').mockImplementation(() => {});
    vi.spyOn(chatService, 'joinGroup').mockImplementation(() => {});
    vi.spyOn(chatService, 'leaveGroup').mockImplementation(() => {});
    vi.spyOn(chatService, 'getUsers').mockImplementation(() => {});
    vi.spyOn(chatService, 'getGroups').mockImplementation(() => {});
    vi.spyOn(chatService, 'getMyGroups').mockImplementation(() => {});
    vi.spyOn(chatService, 'subscribeDashboard').mockImplementation(() => {});
  });

  describe('Property 10: Socket.IO event routing', () => {
    const eventToHandler: Array<[string, string, keyof ChatService]> = [
      ['register', 'handleRegister', 'register'],
      ['broadcast-message', 'handleBroadcast', 'broadcastMessage'],
      ['private-message', 'handlePrivateMessage', 'privateMessage'],
      ['group-message', 'handleGroupMessage', 'groupMessage'],
      ['create-group', 'handleCreateGroup', 'createGroup'],
      ['join-group', 'handleJoinGroup', 'joinGroup'],
      ['leave-group', 'handleLeaveGroup', 'leaveGroup'],
      ['get-users', 'handleGetUsers', 'getUsers'],
      ['get-groups', 'handleGetGroups', 'getGroups'],
      ['get-my-groups', 'handleGetMyGroups', 'getMyGroups'],
      ['subscribe-dashboard', 'handleSubscribeDashboard', 'subscribeDashboard'],
    ];

    it('routes any event to the correct service method with the correct arguments', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...eventToHandler),
          fc.anything(),
          ([_eventName, gatewayMethod, serviceMethod], payload) => {
            const client = createMockSocket('prop-socket');

            // Reset spies for each iteration
            vi.clearAllMocks();

            // Call the gateway handler directly
            (gateway as any)[gatewayMethod](payload, client);

            // Verify the correct service method was called
            expect(chatService[serviceMethod]).toHaveBeenCalled();

            // Verify no other service methods were called
            for (const [, , otherMethod] of eventToHandler) {
              if (otherMethod !== serviceMethod) {
                expect(chatService[otherMethod]).not.toHaveBeenCalled();
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('passes client and payload correctly to the service method', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...eventToHandler),
          fc.record({
            username: fc.string({ minLength: 1, maxLength: 10 }),
            message: fc.string({ minLength: 1, maxLength: 50 }),
            name: fc.string({ minLength: 1, maxLength: 10 }),
            target: fc.string({ minLength: 1, maxLength: 10 }),
            group: fc.string({ minLength: 1, maxLength: 10 }),
            password: fc.string({ minLength: 1, maxLength: 10 }),
          }),
          ([_eventName, gatewayMethod, serviceMethod], payload) => {
            const client = createMockSocket('arg-socket');

            vi.clearAllMocks();

            // Call the gateway handler
            (gateway as any)[gatewayMethod](payload, client);

            // All service methods receive client as first argument
            const calls = (chatService[serviceMethod] as any).mock.calls;
            expect(calls.length).toBe(1);
            expect(calls[0][0]).toBe(client);

            // Methods that accept payload should receive it as second argument
            // getUsers, getGroups, getMyGroups only receive client
            const noPayloadMethods = ['getUsers', 'getGroups', 'getMyGroups'];
            if (!noPayloadMethods.includes(serviceMethod as string)) {
              expect(calls[0][1]).toBe(payload);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
