import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server!: Server;

  constructor(private readonly chatService: ChatService) {}

  afterInit(server: Server): void {
    this.chatService.setServer(server);
  }

  handleConnection(client: Socket): void {
    this.chatService.handleConnection(client);
  }

  handleDisconnect(client: Socket): void {
    this.chatService.handleDisconnect(client);
  }

  @SubscribeMessage('register')
  handleRegister(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    return this.chatService.register(client, payload);
  }

  @SubscribeMessage('broadcast-message')
  handleBroadcast(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    return this.chatService.broadcastMessage(client, payload);
  }

  @SubscribeMessage('private-message')
  handlePrivateMessage(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    return this.chatService.privateMessage(client, payload);
  }

  @SubscribeMessage('group-message')
  handleGroupMessage(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    return this.chatService.groupMessage(client, payload);
  }

  @SubscribeMessage('create-group')
  handleCreateGroup(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    return this.chatService.createGroup(client, payload);
  }

  @SubscribeMessage('join-group')
  handleJoinGroup(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    return this.chatService.joinGroup(client, payload);
  }

  @SubscribeMessage('leave-group')
  handleLeaveGroup(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    return this.chatService.leaveGroup(client, payload);
  }

  @SubscribeMessage('get-users')
  handleGetUsers(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    return this.chatService.getUsers(client);
  }

  @SubscribeMessage('get-groups')
  handleGetGroups(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    return this.chatService.getGroups(client);
  }

  @SubscribeMessage('get-my-groups')
  handleGetMyGroups(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    return this.chatService.getMyGroups(client);
  }

  @SubscribeMessage('subscribe-dashboard')
  handleSubscribeDashboard(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    return this.chatService.subscribeDashboard(client, payload);
  }
}
