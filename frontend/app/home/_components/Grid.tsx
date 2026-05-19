import styled from "styled-components";
const Box = styled.div`
    display: inline-block;
    aspect-ratio: 1 !important;
    background-color: #fff;
    border: 1px solid #eeeeee54;
    transition: all .1s ease;
    width: 8%;

    border-radius: .5rem;


    &:hover{
        background-color: #eeeeee50;
        border:1px solid #ff707024;
    }
`;


const GridContainer= styled.div`
    display: flex;
    width: calc(100vw);
    position: absolute;
    overflow: hidden;
    top: 0;
    left: 0;
    gap: 0;
    height: 80vh;
    flex-wrap: wrap;
    align-items: center;
`



export default function Grid(){
    return <GridContainer>
        {Array.from(new Array(100)).map((_ , i)=><Box key={i}/>)}
    </GridContainer>
}






